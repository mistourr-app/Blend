### Обзор
**Цель проекта**  
Создать Figma‑плагин с **live‑preview** для морфинга двух **open paths**. Плагин выполняет ресемплинг путей, интерполирует геометрию и при подтверждении создаёт **не более 16** финальных векторных объектов по выбранной схеме распределения шагов: **uniform** или **fibonacci** с опцией **reverse**. Плагин работает только с геометрией (координаты точек), не меняет fill/stroke.

**Ключевые требования**  
- Live‑preview при изменении параметров и движении ползунка.  
- Поддержка ручного flip направления второго пути (start↔end).  
- Ресемплинг в M точек (адаптивно: preview M≈64, final M≈256).  
- Ограничение финальной генерации до 16 объектов; стратегия выборки при превышении N.  
- Web Worker для тяжёлых вычислений; UI отзывчив ~30 FPS.  
- Undo‑friendly: все созданные объекты помещаются в одну группу.

---

### Архитектура и компоненты
**Компоненты плагина**
- **UI Panel** — React (рекомендуется) или vanilla HTML/CSS. Контролы: Steps N, Distribution, Reverse, Flip B, Preview quality, Smooth mode, Preview slider, Play/Pause, Apply, Replace.  
- **Main Controller** — glue‑код, взаимодействует с Figma Plugin API, управляет selection, создаёт/обновляет VectorNode.  
- **Geometry Worker** — Web Worker: ресемплинг, вычисление точек по длине, интерполяция, сглаживание, генерация pathData.  
- **Preview Layer Manager** — создаёт/обновляет временные VectorNode для интерактивного просмотра; throttling обновлений.  
- **Final Generator** — выбирает до 16 t‑значений по стратегии и создаёт финальную группу VectorNode.

**Поток данных**
1. UI → Main Controller: параметры (N, distribution, reverse, M, smooth) и команды (preview/apply).  
2. Main Controller → Worker: исходные pathData и параметры.  
3. Worker → Main Controller: массивы точек и готовые pathData для заданных t.  
4. Main Controller → Figma API: обновление временных VectorNode или создание финальной группы.

**Файловая структура проекта**
```
/plugin
  /src
    ui.html
    ui.tsx
    ui.css
    code.ts            // main controller
    worker.ts          // geometry worker (transpiled to worker.js)
    figmaApi.ts        // thin wrapper для операций Figma
    utils/
      pathParser.ts
      resample.ts
      interpolation.ts
      distribution.ts
      smoothing.ts
  manifest.json
  README.md
  tests/
    sample_paths.svg
    unit/
```

---

### Алгоритмы и структуры данных
**Формат входных данных**  
- Для каждого `VectorNode` извлекаем `vectorPaths[0].path` (SVG pathData string) и преобразуем в внутреннее представление: массив сегментов (line, cubic, quad), где каждый сегмент — набор контрольных точек.

**Ресемплинг open path в M точек по длине**  
- **Шаги:**  
  1. Разбить path на сегменты; для каждого сегмента вычислить длину (для bezier — численное приближение).  
  2. Суммарная длина L.  
  3. Для k=0..M-1 целевая позиция s = k/(M-1) * L.  
  4. Найти сегмент, содержащий s, и вычислить точку на сегменте по параметру u (инверсия длины сегмента → параметр кривой).  
- **Выход:** массив точек `[{x,y}, ...]` длины M.

**Сопоставление направлений и концов**  
- Вычислить суммарную L2‑дистанцию между точками при вариантах: A→B и A→reverse(B). Выбрать вариант с меньшей суммарной дистанцией. UI даёт кнопку Flip для ручного переключения.

**Интерполяция геометрии**  
- Для каждого t в [0,1] и каждой точки i:
  ```
  P_i(t) = (1 - t) * A_i + t * B_i
  ```
- Для сглаживания опционально применять Catmull‑Rom к последовательности P_i(t) и аппроксимировать кубическими кривыми для получения pathData.

**Вычисление массива t по distribution**
- **Uniform:** `t_k = k/(N+1), k=1..N`
- **Fibonacci:** сгенерировать F1..F_{N+1}, нормализовать, взять кумулятивные суммы и первые N внутренних точек:
  ```
  f = [1,1,2,3,5,...] // length N+1
  s = sum(f)
  t_k = sum_{i=1..k} f_i / s
  ```
- **Reverse:** заменить `t_k` на `1 - t_k` и инвертировать порядок.

**Ограничение до 16 объектов — priority sampling**
- Если N_requested ≤ 16 → создать все. Иначе:
  1. Сгенерировать полный массив T по distribution.  
  2. Разбить [0,1] на 16 равных интервалов.  
  3. Для каждого интервала выбрать лучший `t` из T: для uniform — ближайший к центру интервала; для fibonacci — точку с наибольшим локальным весом (или ближайшую к центру, если веса равны).  
  4. Если интервал пуст — взять ближайшую соседнюю точку.  
- Гарантировать сортировку и уникальность.

**Структуры данных в коде**
```ts
type Point = { x: number; y: number };
type PathSample = Point[]; // length M
type MorphRequest = {
  pathA: string; // original pathData
  pathB: string;
  M: number;
  distribution: 'uniform'|'fibonacci';
  steps: number; // N
  reverse: boolean;
  smooth: boolean;
};
type MorphResult = { t: number; pathData: string }[];
```

---

### Figma API интеграция и примеры кода
**Разрешения и manifest.json**
```json
{
  "name": "Blend Open Paths",
  "id": "blend-open-paths",
  "api": "1.0.0",
  "main": "dist/code.js",
  "ui": "dist/ui.html",
  "editorType": ["figma"],
  "permissions": []
}
```
(Нет специальных permissions, плагин работает в контексте документа.)

**Основные операции с Figma**
- Получение selection:
```ts
const selection = figma.currentPage.selection;
if (selection.length !== 2) throw new Error("Select exactly 2 open paths");
```
- Создание VectorNode из pathData:
```ts
function createVectorFromPath(pathData: string): VectorNode {
  const node = figma.createVector();
  node.vectorPaths = [{ path: pathData, windingRule: "NONZERO" }];
  return node;
}
```
- Обновление временного VectorNode:
```ts
tempNode.vectorPaths = [{ path: newPathData, windingRule: "NONZERO" }];
```
- Группировка и метка:
```ts
const group = figma.group(nodes, figma.currentPage);
group.name = "Blend result — 2026-03-25";
```
- Undo: все операции выполняются в одном плагин‑событии, поэтому Undo откатит их.

**Пример взаимодействия Main Controller ↔ Worker**
- Main Controller отправляет:
```ts
worker.postMessage({ type: 'morphRequest', payload: morphRequest });
```
- Worker отвечает:
```ts
postMessage({ type: 'morphResult', payload: morphResult });
```

**Псевдокод для Apply**
```ts
async function applyMorph(morphRequest) {
  const fullT = computeTArray(morphRequest.distribution, morphRequest.steps, morphRequest.reverse);
  const selectedT = pickLimitedSteps(fullT, 16);
  const results = await worker.computePathsForT(selectedT, morphRequest);
  const nodes = results.map(r => createVectorFromPath(r.pathData));
  const group = figma.group(nodes, figma.currentPage);
  group.name = "Blend result";
  // optional: position group near original selection
}
```

---

### UI и взаимодействие
**Основные элементы UI**
- **Selection status** — показывает, выбраны ли 2 open paths; кнопка «Select» подсвечивает ошибку.  
- **Controls panel**:
  - **Steps N** (число промежуточных шагов для preview; max 1000).  
  - **Distribution**: radio Uniform / Fibonacci.  
  - **Reverse**: checkbox.  
  - **Flip B**: кнопка для инвертирования направления второй кривой.  
  - **Preview quality**: Low/Medium/High (меняет M: 32/64/128).  
  - **Smooth mode**: checkbox.  
  - **Preview slider**: показывает текущий t; при движении отправляет запрос в worker (throttled).  
  - **Play/Pause**: анимация по tArray.  
  - **Apply**: создаёт финальные объекты (до 16).  
  - **Replace**: переключатель — заменять предыдущую группу или создавать новую.

**Интерактивность и UX**
- **Live‑preview**: при изменении параметров UI отправляет запрос в worker; Preview Layer Manager обновляет временный VectorNode. Throttle обновлений до 30 FPS. Для интерактива использовать меньший M.  
- **Мини‑карта 16 маркеров**: визуализация того, какие t будут созданы при Apply; маркеры подсвечиваются при hover.  
- **Ошибки и подсказки**: предупреждение при сильной асимметрии форм и рекомендация включить Smooth mode.

---

### План разработки и QA
**Роли**  
- **AI агент** — генерирует код по спецификации, запускает тесты, фиксит баги.  
- **Человек‑ревьюер** (опционально) — проверяет UX и edge cases.

**Этапы и ориентировочные сроки**
1. **Подготовка и проектирование** — 1 день  
   - Уточнить UI, подготовить тестовые SVG.  
2. **Прототип UI + Figma integration** — 2 дня  
   - Панель, selection check, базовый preview (без worker).  
3. **Ресемплинг и базовая интерполяция** — 3 дня  
   - Реализовать resample, linear interpolation, preview update.  
4. **Web Worker и оптимизация** — 2 дня  
   - Перенести вычисления в worker, throttling, adaptive M.  
5. **Distribution и cap 16** — 1 день  
   - computeTArray, pickLimitedSteps, мини‑карта.  
6. **Smooth mode** — 2 дня  
   - Catmull‑Rom, UI для flip.  
7. **Finalize Apply, grouping, undo** — 1 день  
8. **Тестирование и багфикс** — 3 дня  
   - Тесты на разных формах, performance, memory leaks.  
9. **Документация и релиз** — 1 день

**Итого:** ~16 рабочих дней для одного AI‑агента с CI и тестами.

**Тестовые кейсы**
- Простые линии и дуги.  
- Сложные асимметричные open paths.  
- Paths разной длины и направленности.  
- N < 16, N = 16, N > 16.  
- Smooth on/off, reverse on/off, flip B.  
- Performance: preview при M=64 и M=256.

**Критерии приёмки**
- Live‑preview отзывчив при интерактиве.  
- Apply создаёт ≤16 объектов в одной группе.  
- Distribution uniform/fibonacci и reverse работают корректно.  
- Undo откатывает создание группы одним действием.  
- Нет блокировки UI при тяжёлых операциях.

---

### Deliverables и инструкции для AI агента
**Артефакты**
- Исходный код плагина (src + сборка).  
- `manifest.json`.  
- Набор тестовых SVG/paths.  
- README с инструкцией установки и использования.  
- Unit tests для resampling, computeTArray, pickLimitedSteps.

**Инструкции для AI агента по кодированию**
1. **Инициализация проекта**: TypeScript + Vite (или esbuild) + React для UI. Настроить сборку worker.  
2. **Реализовать pathParser**: парсинг SVG pathData → сегменты; использовать проверенные алгоритмы (без внешних сетевых зависимостей).  
3. **Реализовать resample.ts**: длина сегмента, точка по длине, равномерный ресемплинг. Покрыть unit tests.  
4. **Реализовать distribution.ts**: computeTArray для uniform/fibonacci и pickLimitedSteps. Покрыть unit tests.  
5. **Реализовать worker.ts**: принимать MorphRequest, возвращать MorphResult; оптимизировать память.  
6. **Main controller**: управление selection, создание временных VectorNode, отправка/приём сообщений от worker.  
7. **UI**: контролы, preview slider, мини‑карта 16 маркеров. Throttle отправки запросов.  
8. **Тесты**: unit tests + интеграционные тесты на sample_paths.svg.  
9. **Документация**: Quick Start, Known Limitations, Troubleshooting.

**Замечания по реализации AI‑агенту**
- Писать чистые, документированные функции; включить JSDoc.  
- Логировать ошибки и возвращать понятные сообщения в UI.  
- Обеспечить fallback: если парсинг pathData неудачен — предложить пользователю экспортировать как полилинию.  
- Не использовать внешние сети или API во время выполнения плагина.

---