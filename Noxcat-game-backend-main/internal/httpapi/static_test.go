package httpapi

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWithStaticFrontendRoutesAPIAssetsAndSPAFallback(t *testing.T) {
	directory := t.TempDir()
	if err := os.WriteFile(filepath.Join(directory, "index.html"), []byte("<main>NOXCAT</main>"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(directory, "assets"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(directory, "assets", "app.js"), []byte("export default 1"), 0o600); err != nil {
		t.Fatal(err)
	}
	api := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-API", "true")
		w.WriteHeader(http.StatusNoContent)
	})
	handler, err := WithStaticFrontend(api, directory)
	if err != nil {
		t.Fatal(err)
	}

	for _, requestPath := range []string{"/auth/login", "/players/id", "/dungeons", "/trades", "/ws"} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, requestPath, nil))
		if response.Code != http.StatusNoContent || response.Header().Get("X-API") != "true" {
			t.Fatalf("API path %q reached static handler", requestPath)
		}
	}

	asset := httptest.NewRecorder()
	handler.ServeHTTP(asset, httptest.NewRequest(http.MethodGet, "/assets/app.js", nil))
	if asset.Code != http.StatusOK || !strings.Contains(asset.Body.String(), "export default") ||
		!strings.Contains(asset.Header().Get("Cache-Control"), "immutable") {
		t.Fatalf("asset response = %d %q %q", asset.Code, asset.Body.String(), asset.Header().Get("Cache-Control"))
	}

	spa := httptest.NewRecorder()
	handler.ServeHTTP(spa, httptest.NewRequest(http.MethodGet, "/collection", nil))
	if spa.Code != http.StatusOK || !strings.Contains(spa.Body.String(), "NOXCAT") ||
		spa.Header().Get("X-Frame-Options") != "DENY" {
		t.Fatalf("SPA response = %d %q", spa.Code, spa.Body.String())
	}
}

func TestWithStaticFrontendRequiresIndex(t *testing.T) {
	if _, err := WithStaticFrontend(http.NotFoundHandler(), t.TempDir()); err == nil {
		t.Fatal("missing index.html accepted")
	}
}
