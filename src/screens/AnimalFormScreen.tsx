import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { FormField } from "../components/FormField";
import { SelectField } from "../components/SelectField";
import { useAppState } from "../state/AppStateContext";
import { useTheme } from "../theme/ThemeContext";
import { spacing } from "../theme/colors";
import { typography } from "../theme/typography";
import {
  animalRepo,
  herdRepo,
  ValidationError,
  type Animal,
  type AnimalOrigin,
  type AnimalSex,
  type AnimalStatus,
  type Herd,
  type Species,
} from "../db";
import {
  ANIMAL_STATUS_VALUES,
  ORIGIN_VALUES,
  SEX_VALUES,
  SPECIES_VALUES,
  iconForSpecies,
  keyForAnimalStatus,
  keyForOrigin,
  keyForSex,
  keyForSpecies,
} from "../utils/livestockLabels";
import type { RootStackScreenProps } from "../navigation/types";

type Mode = "create" | "edit";

const NO_HERD = "__none__";
const NO_PARENT = "__none__";

export const AnimalFormScreen: React.FC<RootStackScreenProps<"AnimalForm">> = ({
  route,
  navigation,
}) => {
  const { animalId, defaultHerdId } = route.params ?? {};
  const mode: Mode = animalId ? "edit" : "create";

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [herds, setHerds] = useState<Herd[]>([]);
  const [allAnimals, setAllAnimals] = useState<Animal[]>([]);

  const [tagId, setTagId] = useState("");
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<Species>("cattle");
  const [breed, setBreed] = useState("");
  const [sex, setSex] = useState<AnimalSex>("female");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [origin, setOrigin] = useState<AnimalOrigin>("born_on_farm");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [herdId, setHerdId] = useState<string>(defaultHerdId ?? NO_HERD);
  const [motherId, setMotherId] = useState<string>(NO_PARENT);
  const [fatherId, setFatherId] = useState<string>(NO_PARENT);
  const [status, setStatus] = useState<AnimalStatus>("alive");
  const [bcs, setBcs] = useState("");
  const [notes, setNotes] = useState("");

  const [tagError, setTagError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [bcsError, setBcsError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  useEffect(() => {
    if (!ctx || !activeFarm) return;
    let cancelled = false;
    void (async () => {
      try {
        const [herdRows, animalRows] = await Promise.all([
          herdRepo.listByFarm(ctx, activeFarm.id),
          animalRepo.listByFarm(ctx, activeFarm.id),
        ]);
        if (cancelled) return;
        setHerds(herdRows);
        setAllAnimals(animalRows);

        if (mode === "edit" && animalId) {
          const existing = await animalRepo.getById(ctx, animalId);
          if (cancelled || !existing) return;
          setTagId(existing.tagId);
          setName(existing.name ?? "");
          setSpecies(existing.species);
          setBreed(existing.breed ?? "");
          setSex(existing.sex);
          setDateOfBirth(
            existing.dateOfBirth ? existing.dateOfBirth.slice(0, 10) : "",
          );
          setOrigin(existing.origin);
          setPurchaseDate(
            existing.purchaseDate ? existing.purchaseDate.slice(0, 10) : "",
          );
          setPurchasePrice(
            existing.purchasePrice != null
              ? String(existing.purchasePrice)
              : "",
          );
          setHerdId(existing.herdId ?? NO_HERD);
          setMotherId(existing.motherId ?? NO_PARENT);
          setFatherId(existing.fatherId ?? NO_PARENT);
          setStatus(existing.status);
          setBcs(
            existing.bodyConditionScore != null
              ? String(existing.bodyConditionScore)
              : "",
          );
          setNotes(existing.notes ?? "");
        }
      } catch (err) {
        if (__DEV__) console.warn("[AnimalForm] hydrate failed", err);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx, activeFarm, mode, animalId]);

  const speciesOptions = useMemo(
    () =>
      SPECIES_VALUES.map((value) => ({
        value,
        label: t(keyForSpecies(value)),
        icon: iconForSpecies(value),
      })),
    [t],
  );

  const sexOptions = useMemo(
    () =>
      SEX_VALUES.map((value) => ({
        value,
        label: t(keyForSex(value)),
      })),
    [t],
  );

  const originOptions = useMemo(
    () =>
      ORIGIN_VALUES.map((value) => ({
        value,
        label: t(keyForOrigin(value)),
      })),
    [t],
  );

  const statusOptions = useMemo(
    () =>
      ANIMAL_STATUS_VALUES.map((value) => ({
        value,
        label: t(keyForAnimalStatus(value)),
      })),
    [t],
  );

  const herdOptions = useMemo(() => {
    const opts = herds.map((h) => ({ value: h.id, label: h.name }));
    return [{ value: NO_HERD, label: t("unassigned") }, ...opts];
  }, [herds, t]);

  const femaleOptions = useMemo(() => {
    const opts = allAnimals
      .filter((a) => a.sex === "female" && a.id !== animalId)
      .map((a) => ({ value: a.id, label: a.name ?? a.tagId }));
    return [{ value: NO_PARENT, label: t("not_set") }, ...opts];
  }, [allAnimals, animalId, t]);

  const maleOptions = useMemo(() => {
    const opts = allAnimals
      .filter((a) => a.sex === "male" && a.id !== animalId)
      .map((a) => ({ value: a.id, label: a.name ?? a.tagId }));
    return [{ value: NO_PARENT, label: t("not_set") }, ...opts];
  }, [allAnimals, animalId, t]);

  const validate = useCallback((): boolean => {
    let ok = true;

    if (!tagId.trim()) {
      setTagError(t("animal_tag_id_required"));
      ok = false;
    } else {
      setTagError(null);
    }

    if (dateOfBirth.trim()) {
      const parsed = new Date(dateOfBirth.trim());
      if (Number.isNaN(parsed.getTime())) {
        setDateError(t("invalid_number"));
        ok = false;
      } else {
        setDateError(null);
      }
    } else {
      setDateError(null);
    }

    if (purchasePrice.trim()) {
      const parsed = Number(purchasePrice.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) {
        setPriceError(t("invalid_number"));
        ok = false;
      } else {
        setPriceError(null);
      }
    } else {
      setPriceError(null);
    }

    if (bcs.trim()) {
      const parsed = Number(bcs.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) {
        setBcsError(t("invalid_number"));
        ok = false;
      } else {
        setBcsError(null);
      }
    } else {
      setBcsError(null);
    }

    return ok;
  }, [tagId, dateOfBirth, purchasePrice, bcs, t]);

  const onSubmit = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    if (!validate()) return;
    if (mode === "create" && !activeFarm) return;

    setSubmitting(true);
    setSubmitError(null);

    const isoDob = dateOfBirth.trim()
      ? new Date(dateOfBirth.trim()).toISOString()
      : null;
    const isoPurchase = purchaseDate.trim()
      ? new Date(purchaseDate.trim()).toISOString()
      : null;
    const parsedPrice = purchasePrice.trim()
      ? Number(purchasePrice.replace(",", "."))
      : null;
    const parsedBcs = bcs.trim() ? Number(bcs.replace(",", ".")) : null;
    const finalHerdId = herdId === NO_HERD ? null : herdId;
    const finalMotherId = motherId === NO_PARENT ? null : motherId;
    const finalFatherId = fatherId === NO_PARENT ? null : fatherId;

    try {
      if (mode === "create" && activeFarm) {
        await animalRepo.create(ctx, {
          farmId: activeFarm.id,
          herdId: finalHerdId,
          tagId: tagId.trim(),
          name: name.trim() || null,
          species,
          breed: breed.trim() || null,
          sex,
          dateOfBirth: isoDob,
          origin,
          purchaseDate: isoPurchase,
          purchasePrice: parsedPrice,
          motherId: finalMotherId,
          fatherId: finalFatherId,
          status,
          bodyConditionScore: parsedBcs,
          notes: notes.trim() || null,
        });
      } else if (mode === "edit" && animalId) {
        await animalRepo.update(ctx, animalId, {
          herdId: finalHerdId,
          tagId: tagId.trim(),
          name: name.trim() || null,
          species,
          breed: breed.trim() || null,
          sex,
          dateOfBirth: isoDob,
          origin,
          purchaseDate: isoPurchase,
          purchasePrice: parsedPrice,
          motherId: finalMotherId,
          fatherId: finalFatherId,
          status,
          bodyConditionScore: parsedBcs,
          notes: notes.trim() || null,
        });
      }
      navigation.goBack();
    } catch (err) {
      const message =
        err instanceof ValidationError
          ? err.message
          : t(
              mode === "create" ? "create_animal_error" : "update_animal_error",
            );
      setSubmitError(message);
      if (__DEV__) console.warn("[AnimalForm] submit failed", err);
    } finally {
      setSubmitting(false);
    }
  }, [
    ctx,
    validate,
    mode,
    activeFarm,
    animalId,
    tagId,
    name,
    species,
    breed,
    sex,
    dateOfBirth,
    origin,
    purchaseDate,
    purchasePrice,
    herdId,
    motherId,
    fatherId,
    status,
    bcs,
    notes,
    navigation,
    t,
  ]);

  const onDelete = useCallback((): void => {
    if (!ctx || !animalId) return;
    Alert.alert(
      t("delete_animal_title"),
      t("delete_animal_message"),
      [
        { text: t("no"), style: "cancel" },
        {
          text: t("yes"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await animalRepo.softDelete(ctx, animalId);
                navigation.goBack();
              } catch (err) {
                if (__DEV__) console.warn("[AnimalForm] delete failed", err);
              }
            })();
          },
        },
      ],
      { cancelable: true },
    );
  }, [ctx, animalId, navigation, t]);

  if (hydrating) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>
            …
          </Text>
        </View>
      </Screen>
    );
  }

  const submitLabel =
    mode === "create" ? t("create_animal") : t("update_animal");

  return (
    <Screen
      footer={
        <View style={styles.footerRow}>
          {mode === "edit" ? (
            <BigButton
              label={t("delete")}
              onPress={onDelete}
              variant="danger"
              style={styles.footerButton}
            />
          ) : null}
          <BigButton
            label={submitLabel}
            onPress={() => void onSubmit()}
            loading={submitting}
            disabled={submitting}
            style={styles.footerButton}
          />
        </View>
      }
    >
      <FormField
        label={t("animal_tag_id")}
        hint={t("animal_tag_id_hint")}
        value={tagId}
        onChangeText={setTagId}
        error={tagError}
        required
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={50}
        returnKeyType="next"
      />

      <FormField
        label={t("animal_name")}
        hint={t("animal_name_hint")}
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={100}
        returnKeyType="next"
      />

      <SelectField<Species>
        label={t("animal_species")}
        value={species}
        onChange={setSpecies}
        options={speciesOptions}
      />

      <FormField
        label={t("animal_breed")}
        hint={t("herd_breed_hint")}
        value={breed}
        onChangeText={setBreed}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={100}
        returnKeyType="next"
      />

      <SelectField<AnimalSex>
        label={t("animal_sex")}
        value={sex}
        onChange={setSex}
        options={sexOptions}
      />

      <FormField
        label={t("animal_date_of_birth")}
        hint={t("animal_date_of_birth_hint")}
        value={dateOfBirth}
        onChangeText={setDateOfBirth}
        error={dateError}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        returnKeyType="next"
      />

      <SelectField<AnimalOrigin>
        label={t("animal_origin")}
        value={origin}
        onChange={setOrigin}
        options={originOptions}
      />

      <FormField
        label={t("animal_purchase_date")}
        hint={t("animal_date_of_birth_hint")}
        value={purchaseDate}
        onChangeText={setPurchaseDate}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        returnKeyType="next"
      />

      <FormField
        label={t("animal_purchase_price")}
        value={purchasePrice}
        onChangeText={setPurchasePrice}
        error={priceError}
        keyboardType="decimal-pad"
        maxLength={12}
        returnKeyType="next"
      />

      <SelectField<AnimalStatus>
        label={t("animal_status")}
        value={status}
        onChange={setStatus}
        options={statusOptions}
      />

      <SelectField<string>
        label={t("animal_herd")}
        hint={t("animal_herd_hint")}
        value={herdId}
        onChange={setHerdId}
        options={herdOptions}
      />

      <SelectField<string>
        label={t("animal_mother")}
        value={motherId}
        onChange={setMotherId}
        options={femaleOptions}
      />

      <SelectField<string>
        label={t("animal_father")}
        value={fatherId}
        onChange={setFatherId}
        options={maleOptions}
      />

      <FormField
        label={t("animal_bcs")}
        hint={t("animal_bcs_hint")}
        value={bcs}
        onChangeText={setBcs}
        error={bcsError}
        keyboardType="decimal-pad"
        maxLength={3}
        returnKeyType="next"
      />

      <FormField
        label={t("animal_notes")}
        hint={t("plot_notes_hint")}
        value={notes}
        onChangeText={setNotes}
        autoCapitalize="sentences"
        autoCorrect={false}
        maxLength={500}
        returnKeyType="done"
      />

      {submitError ? (
        <Text style={[styles.submitError, { color: colors.danger }]}>
          {submitError}
        </Text>
      ) : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  loadingText: { ...typography.body },
  submitError: {
    ...typography.caption,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  footerRow: { flexDirection: "row", gap: spacing.md },
  footerButton: { flex: 1 },
});
