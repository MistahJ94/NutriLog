// Quantity fields are managed by their React components.
// Do not intercept native input events: rounding here previously turned
// fractional servings (for example 0.5 and 1.25) into whole numbers.
// Each form validates positive numeric quantities when a value is committed.
