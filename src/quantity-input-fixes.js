// Keep nutrition quantities in whole servings while preserving normal text editing.
// Capture the input event before React processes it so native number spinners
// cannot use the old 0.01 step inherited from the food-log field.
const lastQuantityValues = new WeakMap()
let normalizing = false

document.addEventListener('focusin', event => {
  const input = event.target
  if (!(input instanceof HTMLInputElement) || !input.matches('.quantity-input')) return
  const value = Number(input.value)
  if (Number.isFinite(value)) lastQuantityValues.set(input, Math.round(value))
}, true)

document.addEventListener('input', event => {
  const input = event.target
  if (normalizing || !(input instanceof HTMLInputElement) || !input.matches('.quantity-input')) return
  if (input.value === '') return

  const value = Number(input.value)
  if (!Number.isFinite(value)) return

  const previous = lastQuantityValues.get(input)
  let next = Math.round(value)

  // Chrome/Android can still apply the old step=0.01 to an existing number
  // input. Treat a +/-0.01 spinner change as one whole serving instead.
  if (Number.isFinite(previous) && Math.abs(value - previous) <= 0.011 && value !== previous) {
    next = previous + (value > previous ? 1 : -1)
  }

  next = Math.max(1, next)
  lastQuantityValues.set(input, next)

  if (String(next) === input.value) return

  normalizing = true
  input.value = String(next)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  normalizing = false
}, true)
