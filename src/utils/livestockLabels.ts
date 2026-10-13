import type {
  AnimalOrigin,
  AnimalSex,
  AnimalStatus,
  BreedingMethod,
  BreedingRecordType,
  FeedType,
  HealthRecordType,
  HerdPurpose,
  ProductionType,
  Species,
} from "../db";

// All pure lookups. No `use` prefix.

export const iconForSpecies = (species: Species): string => {
  switch (species) {
    case "cattle":
      return "🐄";
    case "goat":
      return "🐐";
    case "sheep":
      return "🐑";
    case "chicken":
      return "🐔";
    case "pig":
      return "🐖";
    case "rabbit":
      return "🐇";
    case "duck":
      return "🦆";
    case "turkey":
      return "🦃";
    case "fish":
      return "🐟";
    case "bee":
      return "🐝";
    case "other":
    default:
      return "🐾";
  }
};

export const keyForSpecies = (species: Species): string => `species_${species}`;

export const keyForPurpose = (purpose: HerdPurpose): string =>
  `purpose_${purpose}`;

export const keyForSex = (sex: AnimalSex): string => `sex_${sex}`;

export const keyForOrigin = (origin: AnimalOrigin): string =>
  `origin_${origin}`;

export const keyForAnimalStatus = (status: AnimalStatus): string =>
  `animal_status_${status}`;

export const colorForAnimalStatus = (status: AnimalStatus): string => {
  switch (status) {
    case "alive":
      return "#2E7D32";
    case "sold":
      return "#1976D2";
    case "dead":
      return "#C62828";
    case "slaughtered":
      return "#5D4037";
    case "culled":
      return "#EF6C00";
    case "missing":
      return "#6A1B9A";
    default:
      return "#666";
  }
};

export const iconForHealthType = (type: HealthRecordType): string => {
  switch (type) {
    case "vaccination":
      return "💉";
    case "deworming":
      return "💊";
    case "treatment":
      return "🩺";
    case "illness":
      return "🤒";
    case "injury":
      return "🩹";
    case "mortality":
      return "⚰️";
    case "quarantine":
      return "🚧";
    default:
      return "📝";
  }
};

export const keyForHealthType = (type: HealthRecordType): string =>
  `health_${type}`;

export const iconForBreedingType = (type: BreedingRecordType): string => {
  switch (type) {
    case "mating":
      return "💕";
    case "pregnancy_check":
      return "🔍";
    case "birth":
      return "👶";
    case "weaning":
      return "🍼";
    case "abortion":
      return "❌";
    default:
      return "📝";
  }
};

export const keyForBreedingType = (type: BreedingRecordType): string =>
  `breeding_${type}`;

export const keyForBreedingMethod = (method: BreedingMethod): string => {
  if (method === "artificial_insemination") return "breeding_method_ai";
  return `breeding_method_${method}`;
};

export const iconForFeedType = (type: FeedType): string => {
  switch (type) {
    case "hay":
      return "🌾";
    case "silage":
      return "🌿";
    case "concentrate":
      return "🥣";
    case "pasture":
      return "🌱";
    case "kitchen_scraps":
      return "🍽️";
    case "minerals":
      return "🧂";
    case "water":
      return "💧";
    case "other":
    default:
      return "📦";
  }
};

export const keyForFeedType = (type: FeedType): string => `feed_${type}`;

export const iconForProductionType = (type: ProductionType): string => {
  switch (type) {
    case "milk":
      return "🥛";
    case "eggs":
      return "🥚";
    case "wool":
      return "🧶";
    case "honey":
      return "🍯";
    case "weight":
      return "⚖️";
    case "meat":
      return "🥩";
    case "other":
    default:
      return "📦";
  }
};

export const keyForProductionType = (type: ProductionType): string =>
  `production_${type}`;

export const SPECIES_VALUES: readonly Species[] = [
  "cattle",
  "goat",
  "sheep",
  "chicken",
  "pig",
  "rabbit",
  "duck",
  "turkey",
  "fish",
  "bee",
  "other",
];

export const HERD_PURPOSE_VALUES: readonly HerdPurpose[] = [
  "dairy",
  "meat",
  "eggs",
  "wool",
  "breeding",
  "mixed",
  "other",
];

export const SEX_VALUES: readonly AnimalSex[] = ["female", "male", "unknown"];

export const ORIGIN_VALUES: readonly AnimalOrigin[] = [
  "born_on_farm",
  "purchased",
  "gifted",
  "inherited",
  "unknown",
];

export const ANIMAL_STATUS_VALUES: readonly AnimalStatus[] = [
  "alive",
  "sold",
  "dead",
  "slaughtered",
  "culled",
  "missing",
];

export const HEALTH_TYPE_VALUES: readonly HealthRecordType[] = [
  "vaccination",
  "deworming",
  "treatment",
  "illness",
  "injury",
  "mortality",
  "quarantine",
];

export const BREEDING_TYPE_VALUES: readonly BreedingRecordType[] = [
  "mating",
  "pregnancy_check",
  "birth",
  "weaning",
  "abortion",
];

export const FEED_TYPE_VALUES: readonly FeedType[] = [
  "hay",
  "silage",
  "concentrate",
  "pasture",
  "kitchen_scraps",
  "minerals",
  "water",
  "other",
];

export const PRODUCTION_TYPE_VALUES: readonly ProductionType[] = [
  "milk",
  "eggs",
  "wool",
  "honey",
  "weight",
  "meat",
  "other",
];
