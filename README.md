# Blend
### Плагин Blend для Figma — документ спецификации

---

### Обзор
**Цель:** создать Figma‑плагин с live‑preview, который морфит **open paths** между двумя выбранными кривыми, генерирует до **16** финальных промежуточных векторных объектов и поддерживает распределения шагов **uniform** и **fibonacci** с опцией **reverse**. Плагин работает только с геометрией (координаты точек), не трогает заливки/штрихи.

**Ключевые свойства:**  
- Live‑preview при движении ползунка и при изменении параметров.  
- Интерактивное сопоставление концов (start↔start, start↔end).  
- Ресемплинг путей в M точек для корректной интерполяции.  
- Ограничение финальной генерации до 16 объектов.  
- Опции: число шагов (N), distribution (uniform/fibonacci), reverse, preview quality / final quality, flip direction, smooth mode.

---

### Функциональные требования
**Основные сценарии использования**
- Пользователь выбирает ровно 2 open paths в фрейме → открывает плагин → видит live‑preview морфа → настраивает параметры → нажимает Apply → плагин создаёт до 16 векторных объектов в документе Figma (в одной группе).
- Пользователь может вручную переключать соответствие концов (start/end) и включать режим ручного сопоставления ключевых точек.

**Нефункциональные требования**
- **Максимум создаваемых объектов:** 16.  
- **Интерактивность:** preview не блокирует UI, отклик ~30 FPS при интерактиве.  
- **Качество:** adaptive M: preview M≈64, final M≈256.  
- **Undo:** все создаваемые объекты помещаются в одну группу для лёгкого отката.  
- **Производительность:** ресемплинг и тяжёлая математика выполняются в Web Worker.

**Ограничения**
- Обрабатываются только open paths. Закрытые контуры игнорируются или предлагаются как open с разрывом в выбранной точке.  
- Атрибуты stroke/fill не интерполируются.

---

### Архитектура и поток данных
**Компоненты**
- **UI Panel** (React или vanilla) — контролы: выбор distribution, steps N, reverse, Apply. 
- **Main Plugin Controller** — взаимодействие с Figma API, управление selection, создание/обновление временных и финальных слоёв.  
- **Geometry Worker** (Web Worker) — ресемплинг, вычисление точек по длине, интерполяция, сглаживание, генерация pathData.  
- **Preview Layer Manager** — обновляет временные VectorNode для live‑preview, throttling обновлений.  
- **Final Generator** — выбирает до 16 t‑значений по стратегии и создаёт финальные VectorNode в документе.

**Поток данных**
1. UI → Main Controller: параметры и команда start/preview/apply.  
2. Main Controller → Geometry Worker: исходные pathData и параметры (M, distribution, N, reverse).  
3. Worker → Main Controller: массивы точек, массив pathData для preview/финала.  
4. Main Controller → Figma API: обновление временных VectorNode или создание финальной группы.

**Figma API взаимодействие (основные вызовы)**
- Получение selection: `figma.currentPage.selection`  
- Создание временных/финальных векторов: `figma.createVector()`; установка `vectorNode.vectorPaths = [{path: pathData, windingRule: "NONZERO"}]`  
- Группировка: `figma.group(nodes, figma.currentPage)`  
- Транзакции и undo: операции выполняются в одном событии плагина, чтобы поддержать Undo.

---

### Алгоритмы и псевдокод

#### 1. Ресемплинг open path в M точек по длине
**Идея:** для каждой кривой вычислить длину сегментов, затем для каждой целевой позиции по длине найти соответствующую точку на кривой (интерполяция по параметру).  
**Параметры:** M (например 64 для preview, 256 для final).

#### 2. Сопоставление направлений и концов
- Вычислить суммарное расстояние между точками при вариантах (A→B и A→reverse(B)); выбрать минимальный.  
- Предоставить UI‑кнопку Flip для ручного переключения.

#### 3. Интерполяция точек
Для каждого шага \(t\) и каждой точки \(i\):
\[
P_{i}(t) = (1-t)\cdot A_i + t\cdot B_i
\]
Затем при необходимости применить Catmull‑Rom сглаживание к последовательности \(P_{\cdot}(t)\) и аппроксимировать кубическими кривыми.

#### 4. Вычисление массива t по distribution
**Псевдокод computeTArray**
```js
function computeTArray(distribution, steps, reverse=false) {
  const N = steps;
  if (N <= 0) return [];
  let t = [];
  if (distribution === "uniform") {
    for (let k = 1; k <= N; k++) t.push(k / (N + 1));
  } else { // fibonacci
    let f = [1,1];
    while (f.length < N + 1) f.push(f[f.length-1] + f[f.length-2]);
    const slice = f.slice(0, N+1);
    const s = slice.reduce((a,b)=>a+b,0);
    let cum = 0;
    for (let k = 0; k < N; k++) {
      cum += slice[k];
      t.push(cum / s);
    }
  }
  if (reverse) t = t.map(v => 1 - v).reverse();
  return t;
}
```

#### 5. Ограничение до 16 объектов
**Стратегия priority sampling** — из полного массива t выбрать до 16 значений, равномерно покрывающих [0,1] с приоритетом плотных зон:
```js
function pickLimitedSteps(tArray, maxObjects = 16) {
  const M = Math.min(maxObjects, tArray.length);
  if (tArray.length <= M) return tArray.slice();
  const result = [];
  for (let k = 0; k < M; k++) {
    const a = k / M;
    const b = (k + 1) / M;
    const candidates = tArray.filter(t => t >= a && t < b);
    if (candidates.length > 0) result.push(chooseBestCandidate(candidates, a, b));
    else {
      const left = tArray.slice(0).reverse().find(t => t < a);
      const right = tArray.find(t => t >= b);
      result.push(left ?? right);
    }
  }
  return Array.from(new Set(result)).sort((x,y)=>x-y);
}
```
`chooseBestCandidate` выбирает ближайший к центру интервала для uniform и максимальный локальный вес для fibonacci.

---

### UI и UX
**Панель плагина**
- **Header:** название плагина, версия.  
- **Selection status:** индикатор выбранных объектов (требуется ровно 2 open paths).  
- **Controls:**  
  - **Steps N** (число промежуточных шагов, не более 1000 для preview; final ограничен 16).  
  - **Distribution:** Uniform / Fibonacci.  
  - **Reverse:** чекбокс.  
  - **Flip B:** кнопка для инвертирования направления второй кривой.  
  - **Preview quality:** Low / Medium / High (меняет M).  
  - **Smooth mode:** чекбокс (включает Catmull‑Rom).  
  - **Preview slider:** ползунок для просмотра конкретного шага t.  
  - **Play/Pause:** анимация по шагам.  
  - **Apply:** создать финальные объекты (до 16).  
  - **Replace existing:** переключатель (заменять предыдущую группу или создавать новую).  

**Визуальные подсказки**
- Мини‑карта 16 маркеров, показывающая какие t будут созданы при Apply.  
- Подсказки об артефактах и рекомендация увеличить smooth.

---

### План разработки и QA
**Фазы и сроки** (оценка для 1 разработчика + 1 дизайнера, итеративно, в рабочих днях)

1. **Подготовка и проектирование** — 3 дня  
   - ТЗ, UI макеты, тестовые кейсы, выбор библиотек.

2. **Прототип UI и интеграция с Figma** — 4 дня  
   - Панель, базовая связь с selection, отображение ошибок выбора.

3. **Ресемплинг и базовая интерполяция в Main Thread** — 5 дней  
   - Реализация M‑ресемплинга, простая линейная интерполяция, preview через обновление временных VectorNode.

4. **Перенос тяжёлой логики в Web Worker и оптимизация preview** — 4 дня  
   - Web Worker, throttling, adaptive M, requestAnimationFrame.

5. **Distribution и ограничение до 16 объектов** — 3 дня  
   - computeTArray, pickLimitedSteps, визуальная мини‑карта.

6. **Smooth mode и ручное сопоставление точек** — 4 дня  
   - Catmull‑Rom, UI для ручного маппинга.

7. **Finalize Apply и Undo/Grouping** — 2 дня  
   - Создание финальной группы, replace/append, метки.

8. **Тестирование и багфикс** — 5 дней  
   - Тесты на разных формах, производительность, edge cases.

9. **Документация и релиз** — 2 дня  
   - Руководство пользователя, release notes.

**Итого:** ~32 рабочих дня.

**Deliverables**
- Рабочий Figma‑плагин с UI и функционалом Apply.  
- Тестовый набор SVG/paths для проверки.  
- Документация: Quick Start, Troubleshooting, Known Limitations.

**Критерии приёмки**
- Live‑preview работает при выборе 2 open paths.  
- При Apply создаётся не более 16 объектов в одной группе.  
- Distribution uniform и fibonacci дают ожидаемые распределения; reverse корректно инвертирует.  
- Ресемплинг и интерполяция не приводят к критическим сбоям; плагин не блокирует UI.  
- Undo откатывает создание группы одним действием.

---

### Тестирование и риски
**Тестовые кейсы**
- Симметричные простые линии.  
- Асимметричные сложные open paths с разной длиной.  
- Paths с разной направленностью (тест flip).  
- Большое N в preview и Apply с N>16.  
- Включение smooth mode и ручного сопоставления.

**Риски и меры**
- **Артефакты при сильной разнице форм** — mitigation: smooth mode, ручное сопоставление, предупреждение в UI.  
- **Производительность при больших M** — mitigation: Web Worker, adaptive M, ограничение preview quality.  
- **Ошибки при парсинге сложных pathData** — mitigation: robust parser, fallback на полилинию, логирование ошибок.  
- **Ограничения Figma API** — mitigation: тестировать на реальных файлах, использовать безопасные операции и группировки.

---

### Заключение
Плагин реализуем в виде Figma Plugin с разделением на UI, контроллер и Web Worker. Ключевые особенности — live‑preview, поддержка uniform и fibonacci распределений, ручное сопоставление концов и жёсткое ограничение финальной генерации до 16 объектов. Предложенный план покрывает проект от прототипа до релиза с учётом тестирования и документации.