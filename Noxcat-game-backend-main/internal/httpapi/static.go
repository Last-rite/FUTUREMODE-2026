package httpapi

import (
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path"
	"strings"
)

var apiPathPrefixes = []string{
	"/auth/", "/players/", "/dungeons", "/battles/", "/treasures/",
	"/trades", "/ws", "/admin/",
}

// WithStaticFrontend optionally serves a Vite build and falls back to its
// index for client-side routes. API and WebSocket paths always reach api.
func WithStaticFrontend(api http.Handler, directory string) (http.Handler, error) {
	if api == nil {
		return nil, errors.New("API handler is required")
	}
	if directory == "" {
		return api, nil
	}
	root := os.DirFS(directory)
	if _, err := fs.Stat(root, "index.html"); err != nil {
		return nil, fmt.Errorf("open static frontend index: %w", err)
	}
	files := http.FileServer(http.FS(root))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isAPIPath(r.URL.Path) || (r.Method != http.MethodGet && r.Method != http.MethodHead) {
			api.ServeHTTP(w, r)
			return
		}

		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if name == "." {
			name = "index.html"
		}
		info, err := fs.Stat(root, name)
		if err != nil || info.IsDir() {
			request := r.Clone(r.Context())
			request.URL.Path = "/"
			setStaticHeaders(w, "index.html")
			files.ServeHTTP(w, request)
			return
		}
		setStaticHeaders(w, name)
		files.ServeHTTP(w, r)
	}), nil
}

func isAPIPath(requestPath string) bool {
	for _, prefix := range apiPathPrefixes {
		if strings.HasPrefix(requestPath, prefix) {
			return true
		}
	}
	return false
}

func setStaticHeaders(w http.ResponseWriter, name string) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Referrer-Policy", "same-origin")
	if name == "index.html" {
		w.Header().Set("Cache-Control", "no-cache")
	} else if strings.HasPrefix(name, "assets/") {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	}
}
