// Stamina meter: drains while sprinting, regenerates otherwise.
// Tiers map to animation clips: turbo (fresh) -> regular -> gassed.

export const TIERS = {
  TURBO: 'turbo',
  REGULAR: 'regular',
  GASSED: 'gassed',
};

export class StaminaMeter {
  constructor({
    max = 100,
    drainRate = 22, // per second while sprinting
    regenRate = 14, // per second while resting
    regularBelow = 60, // drop to Regular below this, back to Turbo above it
    gassedBelow = 25, // drop to Gassed below this
  } = {}) {
    this.max = max;
    this.value = max;
    this.drainRate = drainRate;
    this.regenRate = regenRate;
    this.regularBelow = regularBelow;
    this.gassedBelow = gassedBelow;
  }

  update(dt, sprinting) {
    const rate = sprinting ? -this.drainRate : this.regenRate;
    this.value = Math.min(this.max, Math.max(0, this.value + rate * dt));
    return this.tier;
  }

  get tier() {
    if (this.value < this.gassedBelow) return TIERS.GASSED;
    if (this.value < this.regularBelow) return TIERS.REGULAR;
    return TIERS.TURBO;
  }

  get percent() {
    return (this.value / this.max) * 100;
  }
}
