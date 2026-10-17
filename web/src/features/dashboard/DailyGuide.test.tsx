import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { fixtures, renderElement } from '@/test/harness';
import type { Task } from '@/types/api';
import { DailyGuide } from './DailyGuide';
import type { Panel } from './useDashboardData';

const task = (overrides: Record<string, unknown> = {}) => fixtures.task(overrides) as Task;
function show(rows: Task[], total = rows.length) {
  return renderElement(<DailyGuide tasks={{ status: 'ready', data: rows }} total={{ status: 'ready', data: total }} userId={1} />);
}

describe('DailyGuide', () => {
  it('başkasının işini önermek yerine kullanıcının açık işini seçer', () => {
    show([
      task({ id: 8, title: 'Başkasının işi', assigned_to: { id: 2, name: 'Ece' } }),
      task({ id: 9, title: 'Benim işim', assigned_to: { id: 1, name: 'Deniz' } }),
    ]);
    expect(screen.getByRole('link', { name: 'Bu işe geç' })).toHaveAttribute('href', '/app/tasks/9');
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Benim işim');
    expect(screen.getByText('Bugün sana atanan açık işlerden biri')).toBeInTheDocument();
  });

  it('kişisel açık iş yoksa atanmamış işi açık açıklamayla önerir', () => {
    show([task({ id: 5, assigned_to: null })]);
    expect(screen.getByRole('link', { name: 'Bu işe geç' })).toHaveAttribute('href', '/app/tasks/5');
    expect(screen.getByText('Bugünün planında henüz kimseye atanmamış bir iş')).toBeInTheDocument();
  });

  it('atanmamış iş daha erken listelense de kişisel işi gerekçesiyle öne alır', () => {
    show([task({ id: 5, assigned_to: null }), task({ id: 6, assigned_to: { id: 1, name: 'Deniz' } })]);
    expect(screen.getByRole('link', { name: 'Bu işe geç' })).toHaveAttribute('href', '/app/tasks/6');
  });

  it('toplam doğrulanamıyorsa tamamlanma veya yüzde iddiası üretmez', () => {
    renderElement(<DailyGuide tasks={{ status: 'ready', data: [task({ is_completed: true })] }} total={{ status: 'error', data: null }} userId={1} />);
    expect(screen.queryByText('Bugüne planlanan işler tamamlandı.')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('tamamlanan kişisel işi atlar ve API sırasındaki ilk açık kişisel işi seçer', () => {
    show([
      task({ id: 1, is_completed: true, assigned_to: { id: 1 } }),
      task({ id: 2, assigned_to: { id: 1 }, scheduled_time: '11:00' }),
      task({ id: 3, assigned_to: { id: 1 }, scheduled_time: '09:00' }),
    ]);
    expect(screen.getByRole('link', { name: 'Bu işe geç' })).toHaveAttribute('href', '/app/tasks/2');
  });

  it('boş planı tamamlanmış gün gibi sunmaz, ilk işi planlamaya yönlendirir', () => {
    show([]);
    expect(screen.getByRole('link', { name: 'İlk işini planla' })).toHaveAttribute('href', '/app/tasks/new');
    expect(screen.queryByText('Bugüne planlanan işler tamamlandı.')).not.toBeInTheDocument();
  });

  it('tam veri geldiğinde gerçek şirket ilerlemesini gösterir', () => {
    show([task({ is_completed: true }), task({ id: 2 })]);
    const progress = screen.getByRole('progressbar', { name: 'Şirketin günlük planında tamamlanan işler' });
    expect(progress).toHaveAttribute('value', '1');
    expect(progress).toHaveAttribute('max', '2');
  });

  it('yalnızca tam ve tamamlanmış planda günün bittiğini söyler', () => {
    show([task({ is_completed: true })]);
    expect(screen.getByText('Bugüne planlanan işler tamamlandı.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bu işe geç' })).not.toBeInTheDocument();
  });

  it('kısmi sayfada tüm işler bitti veya sahte ilerleme yüzdesi demez', () => {
    show([task({ is_completed: true })], 30);
    expect(screen.queryByText('Bugüne planlanan işler tamamlandı.')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText('Bugüne planlı 30 iş var; bu bölümde 1 tanesi gösteriliyor.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Günlük planı aç' })).toHaveAttribute('href', '/app/tasks/today');
  });

  it('yalnızca başkalarına atanmış açık işleri kullanıcının sıradaki işi yapmaz', () => {
    show([task({ assigned_to: { id: 2, name: 'Ece' } })]);
    expect(screen.queryByRole('link', { name: 'Bu işe geç' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Günlük planı aç' })).toBeInTheDocument();
  });

  it('saatsiz işe saat uydurmaz', () => {
    show([task({ scheduled_time: null })]);
    expect(screen.queryByText(/Planlanan saat/)).not.toBeInTheDocument();
  });

  for (const status of ['loading', 'error', 'forbidden'] as const) {
    it(`${status} durumunda görev veya tamamlanma iddiası üretmez`, () => {
      const panel: Panel<Task[]> = { status, data: null };
      renderElement(<DailyGuide tasks={panel} total={{ status, data: null }} userId={1} />);
      expect(screen.queryByRole('link', { name: 'Bu işe geç' })).not.toBeInTheDocument();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.queryByText('Bugüne planlanan işler tamamlandı.')).not.toBeInTheDocument();
    });
  }
});
