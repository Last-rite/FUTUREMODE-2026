import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TradeView from '../../src/components/TradeView.jsx';

const me = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const offeredUnit = '33333333-3333-4333-8333-333333333333';
const requestedUnit = '44444444-4444-4444-8444-444444444444';

const data = {
  pets: [{
    id: offeredUnit,
    name: 'COOL NOXCAT',
    level: 3,
    protected: false,
    selected: false,
    alive: true,
    equipped: null,
    ownerId: me,
  }],
  items: [],
  trades: [],
  lostAssets: [],
  dungeons: [],
};

function renderTradeView(overrides = {}) {
  const props = {
    data,
    currentUser: { id: me },
    onCreateTrade: vi.fn().mockResolvedValue(data),
    onResolveTrade: vi.fn(),
    onLoadTradeAssets: vi.fn().mockResolvedValue({
      pets: [{ id: requestedUnit, name: 'HARD NOXCAT', level: 4 }],
      items: [],
    }),
    onMessage: vi.fn(),
    ...overrides,
  };
  render(<TradeView {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '發起交易' }));
  return props;
}

describe('TradeView exact asset exchange', () => {
  it('loads the recipient inventory and submits exact requested IDs', async () => {
    const props = renderTradeView();
    fireEvent.change(screen.getByPlaceholderText('輸入對方 UUID'), { target: { value: other } });
    fireEvent.click(screen.getByRole('button', { name: '讀取對方可交易資產' }));
    await waitFor(() => expect(props.onLoadTradeAssets).toHaveBeenCalledWith(other));

    fireEvent.click(screen.getAllByRole('button', { name: 'NOXCAT' }).at(-1));
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects.at(-1), { target: { value: requestedUnit } });
    fireEvent.click(screen.getByRole('button', { name: '送出交換請求' }));

    await waitFor(() => expect(props.onCreateTrade).toHaveBeenCalledWith({
      to_player_id: other,
      unit_id: offeredUnit,
      requested_assets: [{ unit_id: requestedUnit }],
    }));
  });

  it('keeps one-way gifting explicit with an empty requested bundle', async () => {
    const props = renderTradeView();
    fireEvent.change(screen.getByPlaceholderText('輸入對方 UUID'), { target: { value: other } });
    fireEvent.click(screen.getByRole('button', { name: '單向贈與' }));
    fireEvent.click(screen.getByRole('button', { name: '送出贈與請求' }));

    await waitFor(() => expect(props.onCreateTrade).toHaveBeenCalledWith({
      to_player_id: other,
      unit_id: offeredUnit,
      requested_assets: [],
    }));
    expect(props.onLoadTradeAssets).not.toHaveBeenCalled();
  });
});
