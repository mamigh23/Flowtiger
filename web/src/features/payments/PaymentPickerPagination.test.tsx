import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bodyOf, fixtures as f, jsonResponse, mockApi, renderApp } from '@/test/harness';

const session = {
  '/me': () => jsonResponse(200, { data: f.user() }),
  '/companies': () => jsonResponse(200, { data: [f.company()], meta: { active_company_id: 7 } }),
};
const customers = Array.from({ length: 100 }, (_, i) => f.customer({ id: i + 1, name: `Müşteri ${i + 1}` }));
const entries = Array.from({ length: 100 }, (_, i) => f.financeEntry({ id: i + 1 }));
const page = (items: unknown[], currentPage = 1) => jsonResponse(200, f.paginated(items, 101, { currentPage, lastPage: 2, perPage: 100 }));

describe('Ödeme formu seçenek sayfalaması', () => {
  it('101. müşteri ve finans hedefini yalnızca istek üzerine yükleyip doğru kimliklerle gönderir', async () => {
    const fetchMock = mockApi({
      ...session,
      '/customers': (_init, url) => new URL(url!).searchParams.get('page') === '2'
        ? page([f.customer({ id: 101, name: 'Sonraki müşteri' })], 2) : page(customers),
      '/finance-entries': (_init, url) => new URL(url!).searchParams.get('page') === '2'
        ? page([f.financeEntry({ id: 101 })], 2) : page(entries),
      '/payments': () => jsonResponse(422, { message: 'Kontrol', errors: { amount_minor: ['Kontrol'] } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/app/payments/new', { token: 'test-token' });
    await screen.findByRole('button', { name: 'Daha fazla müşteri yükle' });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('page=2'))).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Daha fazla müşteri yükle' }));
    await screen.findByRole('option', { name: 'Sonraki müşteri' });
    await user.selectOptions(screen.getByLabelText('Müşteri'), '101');
    await user.click(screen.getByRole('button', { name: 'Daha fazla finans kaydı yükle' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Daha fazla finans kaydı yükle' })).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Dağıtım ekle' }));
    await user.selectOptions(screen.getByLabelText('Finans kaydı 1'), '101');
    await user.type(screen.getByLabelText('Tutar', { exact: true }), '100,00');
    await user.type(screen.getByLabelText('Dağıtım tutarı 1'), '100,00');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/payments') && init?.method === 'POST');
      expect(call).toBeDefined();
      expect(bodyOf(call![1])).toMatchObject({ customer_id: 101, allocations: [{ finance_entry_id: 101, amount_minor: 10000 }] });
    });
  });

  it('ikinci sayfa hatasında mevcut seçimi korur, aynı sayfayı tekrar dener ve seçenekleri tekilleştirir', async () => {
    let secondAttempts = 0;
    vi.stubGlobal('fetch', mockApi({
      ...session,
      '/customers': (_init, url) => {
        if (new URL(url!).searchParams.get('page') !== '2') return page(customers);
        return ++secondAttempts === 1 ? jsonResponse(500, { message: 'Server Error' })
          : page([customers[0], f.customer({ id: 101, name: 'Sonraki müşteri' })], 2);
      },
      '/finance-entries': () => jsonResponse(200, f.paginated([], 0)),
    }));
    const user = userEvent.setup();
    renderApp('/app/payments/new', { token: 'test-token' });
    await screen.findByRole('option', { name: 'Müşteri 1' });
    await user.selectOptions(screen.getByLabelText('Müşteri'), '1');
    await user.click(screen.getByRole('button', { name: 'Daha fazla müşteri yükle' }));
    await screen.findByRole('button', { name: 'Müşterileri tekrar yükle' });
    expect(screen.getByLabelText('Müşteri')).toHaveValue('1');
    await user.click(screen.getByRole('button', { name: 'Müşterileri tekrar yükle' }));
    await screen.findByRole('option', { name: 'Sonraki müşteri' });
    expect(screen.getByLabelText('Müşteri')).toHaveValue('1');
    expect(within(screen.getByLabelText('Müşteri')).getAllByRole('option', { name: 'Müşteri 1' })).toHaveLength(1);
    expect(secondAttempts).toBe(2);
  });

  it('düzenlenen ödemenin müşterisini ilk sayfa başarısız olsa bile seçili tutar', async () => {
    vi.stubGlobal('fetch', mockApi({
      ...session,
      '/payments/800': () => jsonResponse(200, { data: f.payment({ customer: { id: 501, customer_no: 1, name: 'Mevcut müşteri' }, allocations: [] }) }),
      '/customers': () => jsonResponse(500, { message: 'Server Error' }),
      '/finance-entries': () => jsonResponse(200, f.paginated([], 0)),
    }));
    renderApp('/app/payments/800/edit', { token: 'test-token' });
    await screen.findByRole('button', { name: 'Müşterileri tekrar yükle' });
    expect(screen.getByLabelText('Müşteri')).toHaveValue('501');
    expect(screen.getByRole('option', { name: 'Mevcut müşteri' })).toBeInTheDocument();
  });
});
