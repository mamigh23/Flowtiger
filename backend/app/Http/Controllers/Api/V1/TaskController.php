<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\TaskRequest;
use App\Http\Resources\TaskResource;
use App\Models\Task;
use App\Services\CompanyContext;
use App\Services\TaskService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * Task/Planning v1 — günün işleri.
 *
 * Bu controller'da tek bir `where('company_id', ...)` yoktur: tenant
 * filtresi CompanyScope tarafından sorgu kurulurken uygulanır. Elle
 * yazılmış bir filtre, bir gün unutulacak bir filtredir (§3, §8).
 *
 * {task} route model binding'i de aynı sebeple güvenlidir: binding
 * sorgusu global scope'un altından geçer, başka tenant'ın görevi
 * bulunamaz ve 404 döner.
 *
 * SİLME UCU VARDIR — finans ve ödemeden farklı olarak. Finans kaydı iptal
 * edilir çünkü silinmesi geçmiş bir dönemin toplamını sessizce
 * değiştirir; yapılacak bir işin böyle bir özelliği yok.
 */
class TaskController extends Controller
{
    use AuthorizesRequests;

    private const DEFAULT_PER_PAGE = 15;

    /**
     * Üst sınır olmazsa `?per_page=1000000` tek istekte tüm tenant'ı
     * belleğe çeker — bu bir DoS vektörüdür (§16).
     */
    private const MAX_PER_PAGE = 100;

    /** Yanıtın ihtiyaç duyduğu ilişkiler; N+1 olmadan. */
    private const RELATIONS = ['customer', 'creator', 'assignee'];

    public function __construct(
        private readonly CompanyContext $context,
        private readonly TaskService $tasks,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Task::class);

        $validated = $request->validate([
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
            'date' => ['sometimes', 'date_format:Y-m-d'],
        ]);

        $query = $this->baseQuery();

        if (isset($validated['date'])) {
            $query->whereDate('scheduled_date', $validated['date']);
        }

        return TaskResource::collection(
            $query->paginate((int) ($validated['per_page'] ?? self::DEFAULT_PER_PAGE))
                ->withQueryString()
        );
    }

    /**
     * BUGÜN — ŞİRKETİN SAAT DİLİMİNE GÖRE.
     *
     * Ayrı bir uç olmasının tek sebebi bu: "bugün" istemciye
     * sorulsaydı, saat dilimi şirketinkinden farklı bir kullanıcı yanlış
     * günün işlerini görürdü. Mali kimlik fazında dönem sınırı için
     * `timezone` tam olarak bu tuzağa karşı NOT NULL yapılmıştı.
     *
     * İstemci "bugün"ün hangi gün olduğunu bilmek zorunda değil; sunucu
     * biliyor.
     */
    public function today(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Task::class);

        $validated = $request->validate([
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
        ]);

        $company = $this->context->getOrFail();
        $today = now()->setTimezone($company->timezone)->toDateString();

        return TaskResource::collection(
            $this->baseQuery()
                ->whereDate('scheduled_date', $today)
                ->paginate((int) ($validated['per_page'] ?? self::DEFAULT_PER_PAGE))
                ->withQueryString()
        );
    }

    public function store(TaskRequest $request): TaskResource
    {
        $this->authorize('create', Task::class);

        $task = $this->tasks->create(
            $this->context->getOrFail(),
            $request->user(),
            $request->validated(),
        );

        return TaskResource::make($task->load(self::RELATIONS));
    }

    public function show(Task $task): TaskResource
    {
        $this->authorize('view', $task);

        return TaskResource::make($task->load(self::RELATIONS));
    }

    /**
     * PUT: tam değiştirme. Gövdede olmayan alan boşaltılır — "saati sil"
     * ile "saate dokunma" ayrımı ancak böyle anlatılabilir.
     */
    public function update(TaskRequest $request, Task $task): TaskResource
    {
        $this->authorize('update', $task);

        $updated = $this->tasks->update(
            $this->context->getOrFail(),
            $task,
            $request->validated(),
        );

        return TaskResource::make($updated->load(self::RELATIONS));
    }

    public function destroy(Task $task): Response
    {
        $this->authorize('delete', $task);

        $this->tasks->delete($this->context->getOrFail(), $task);

        return response()->noContent();
    }

    /**
     * Görevi tamamlar.
     *
     * Gövde ALMAZ: tamamlanma zamanını sunucu yazar, istemci bir işin ne
     * zaman bitirildiğini seçemez.
     */
    public function complete(Task $task): TaskResource
    {
        $this->authorize('complete', $task);

        $completed = $this->tasks->complete($this->context->getOrFail(), $task);

        return TaskResource::make($completed->load(self::RELATIONS));
    }

    public function reopen(Task $task): TaskResource
    {
        $this->authorize('complete', $task);

        $reopened = $this->tasks->reopen($this->context->getOrFail(), $task);

        return TaskResource::make($reopened->load(self::RELATIONS));
    }

    /**
     * SIRALAMA: saate göre artan, saatsizler EN SONA.
     *
     * Saatsiz bir işi günün başına koymak, saati olan randevuların önüne
     * geçirirdi — oysa "bir ara yapılacak" bir iş, 09:00 randevusundan
     * önce gelmez.
     *
     * İkincil sıra (id) ZORUNLU: aynı saate yazılmış iki görev
     * `scheduled_time`'da eşitlenir ve sıralama belirsizleşir. Belirsiz
     * sıralama, sayfalar arasında kayıt tekrarına ya da kayıp kayda yol
     * açar (audit ve finans listelerindeki aynı gerekçe).
     */
    private function baseQuery(): Builder
    {
        return Task::query()
            ->with(self::RELATIONS)
            ->orderByRaw('scheduled_time ASC NULLS LAST')
            ->orderBy('id');
    }
}
