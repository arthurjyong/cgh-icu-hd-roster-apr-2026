function hashSeedToUint32_(seed) {
  if (seed === null || seed === undefined || seed === "") {
    return null;
  }

  if (typeof seed === "number" && isFinite(seed)) {
    return seed >>> 0;
  }

  const text = String(seed);
  let hash = 2166136261;

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRng_(seed) {
  const normalizedSeed = hashSeedToUint32_(seed);
  let state = normalizedSeed;

  if (state === null) {
    throw new Error("seed is required for createSeededRng_.");
  }

  return {
    kind: "seeded",
    initialSeed: normalizedSeed,
    nextFloat: function() {
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    nextInt: function(maxExclusive) {
      if (!maxExclusive || maxExclusive < 1) return 0;
      return Math.floor(this.nextFloat() * maxExclusive);
    }
  };
}

function createMathRandomRng_() {
  return {
    kind: "math",
    initialSeed: null,
    nextFloat: function() {
      return Math.random();
    },
    nextInt: function(maxExclusive) {
      if (!maxExclusive || maxExclusive < 1) return 0;
      return Math.floor(this.nextFloat() * maxExclusive);
    }
  };
}

function coerceRandomGenerator_(rng) {
  if (rng && typeof rng.nextFloat === "function") {
    return rng;
  }

  return createMathRandomRng_();
}
