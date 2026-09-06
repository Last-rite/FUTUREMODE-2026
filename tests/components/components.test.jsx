import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import BottomNav from '../../src/components/BottomNav.jsx';
import Toast from '../../src/components/Toast.jsx';
import BrandLockup from '../../src/components/BrandLockup.jsx';
import AuthModal from '../../src/components/AuthModal.jsx';
import BattleTransitionOverlay from '../../src/components/BattleTransitionOverlay.jsx';

describe('UI Components', () => {
  describe('BrandLockup', () => {
    it('renders the brand title correctly', () => {
      render(<BrandLockup />);
      expect(screen.getByAltText('NoxPawble')).toBeInTheDocument();
    });
  });

  describe('Toast', () => {
    it('renders message with status role and custom tone', () => {
      render(<Toast message="連線成功" tone="success" onDone={vi.fn()} />);
      const statusEl = screen.getByRole('status');
      expect(statusEl).toBeInTheDocument();
      expect(statusEl).toHaveTextContent('連線成功');
      expect(statusEl).toHaveClass('toast--success');
    });

    it('renders error tone with appropriate icon/class', () => {
      render(<Toast message="操作失敗" tone="error" onDone={vi.fn()} />);
      const statusEl = screen.getByRole('status');
      expect(statusEl).toHaveClass('toast--error');
    });
  });

  describe('BottomNav', () => {
    it('renders navigation buttons and triggers onNavigate when clicked', () => {
      const onNavigate = vi.fn();
      render(<BottomNav active="home" onNavigate={onNavigate} />);

      expect(screen.getByText('主畫面')).toBeInTheDocument();
      expect(screen.getByText('收藏')).toBeInTheDocument();
      expect(screen.getByText('交易')).toBeInTheDocument();

      fireEvent.click(screen.getByText('收藏'));
      expect(onNavigate).toHaveBeenCalledWith('collection');

      fireEvent.click(screen.getByText('交易'));
      expect(onNavigate).toHaveBeenCalledWith('trade');
    });
  });

  describe('BattleTransitionOverlay', () => {
    it('can be dismissed with the keyboard', () => {
      const onDismiss = vi.fn();
      render(<BattleTransitionOverlay onDismiss={onDismiss} />);

      fireEvent.keyDown(screen.getByRole('button', { name: 'Skip combat transition' }), {
        key: 'Enter',
      });

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('AuthModal', () => {
    it('switches between Login and Register modes', () => {
      render(<AuthModal onLoginSuccess={vi.fn()} />);

      // Defaults to login
      expect(screen.getByRole('heading', { name: '登入' })).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('玩家暱稱')).not.toBeInTheDocument();

      // Click register tab
      fireEvent.click(screen.getByRole('tab', { name: /創建新帳號/i }));
      expect(screen.getByRole('heading', { name: '建立帳號' })).toBeInTheDocument();
      expect(screen.getByPlaceholderText('玩家暱稱')).toBeInTheDocument();
    });

    it('submits login credentials when form is submitted', async () => {
      const onLoginSuccess = vi.fn().mockResolvedValue();
      const { container } = render(<AuthModal onLoginSuccess={onLoginSuccess} />);

      const userInput = screen.getByPlaceholderText('帳號');
      const passInput = screen.getByPlaceholderText('密碼');
      const submitBtn = container.querySelector('button[type="submit"]');

      fireEvent.change(userInput, { target: { value: 'player_one' } });
      fireEvent.change(passInput, { target: { value: 'secret123' } });
      await act(async () => {
        fireEvent.click(submitBtn);
      });

      expect(onLoginSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'login',
          username: 'player_one',
          password: 'secret123',
        })
      );
    });

    it('matches backend credential validation before registration', async () => {
      const onLoginSuccess = vi.fn();
      const { container } = render(<AuthModal onLoginSuccess={onLoginSuccess} />);

      fireEvent.click(screen.getByRole('tab', { name: /創建新帳號/i }));
      fireEvent.change(screen.getByPlaceholderText('帳號'), { target: { value: 'player_two' } });
      fireEvent.change(screen.getByPlaceholderText('密碼'), { target: { value: 'short' } });
      fireEvent.change(screen.getByPlaceholderText('玩家暱稱'), { target: { value: '玩家二' } });
      await act(async () => {
        fireEvent.click(container.querySelector('button[type="submit"]'));
      });

      expect(onLoginSuccess).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent('密碼需為 8–72 bytes');
    });

    it('translates backend field validation into an actionable message', async () => {
      const onLoginSuccess = vi.fn().mockRejectedValue({
        message: 'request validation failed',
        fields: { username: 'must be 3 to 32 ASCII letters, digits, or underscores' },
      });
      const { container } = render(<AuthModal onLoginSuccess={onLoginSuccess} />);

      fireEvent.click(screen.getByRole('tab', { name: /創建新帳號/i }));
      fireEvent.change(screen.getByPlaceholderText('帳號'), { target: { value: 'player_three' } });
      fireEvent.change(screen.getByPlaceholderText('密碼'), { target: { value: 'secret123' } });
      fireEvent.change(screen.getByPlaceholderText('玩家暱稱'), { target: { value: '玩家三' } });
      await act(async () => {
        fireEvent.click(container.querySelector('button[type="submit"]'));
      });

      expect(await screen.findByRole('alert')).toHaveTextContent('帳號需為 3–32 個英文字母、數字或底線');
    });
  });
});
