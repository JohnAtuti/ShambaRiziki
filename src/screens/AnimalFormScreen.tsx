import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { FormField } from "../components/FormField";
import { SelectField } from "../components/SelectField";
import { WizardForm, type WizardStep } from "../components/WizardForm";
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

  const onSubmit = useCallback(async (): Promise<void> => {
    if (!ctx) return;
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

  const steps = useMemo<readonly WizardStep[]>(
    () => [
      {
        id: "identity",
        titleKey: "step_animal_identity",
        hintKey: "step_animal_identity_hint",
        icon: "🐄",
        validate: () => tagId.trim().length > 0,
        render: () => (
          <>
            <FormField
              label={t("animal_tag_id")}
              hint={t("animal_tag_id_hint")}
              value={tagId}
              onChangeText={setTagId}
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
              returnKeyType="done"
            />
          </>
        ),
      },
      {
        id: "classification",
        titleKey: "step_animal_classification",
        hintKey: "step_animal_classification_hint",
        icon: "🐐",
        validate: () => true,
        render: () => (
          <>
            <SelectField<Species>
              label={t("animal_species")}
              value={species}
              onChange={setSpecies}
              options={speciesOptions}
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
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              returnKeyType="done"
            />
          </>
        ),
      },
      {
        id: "origin",
        titleKey: "step_animal_origin",
        hintKey: "step_animal_origin_hint",
        icon: "🏠",
        validate: () => true,
        isOptional: true,
        render: () => (
          <>
            <SelectField<AnimalOrigin>
              label={t("animal_origin")}
              value={origin}
              onChange={setOrigin}
              options={originOptions}
            />
            <FormField
              label={t("animal_purchase_date")}
              hint="YYYY-MM-DD"
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
              keyboardType="decimal-pad"
              maxLength={12}
              returnKeyType="done"
            />
          </>
        ),
      },
      {
        id: "family",
        titleKey: "step_animal_family",
        hintKey: "step_animal_family_hint",
        icon: "👪",
        validate: () => true,
        isOptional: true,
        render: () => (
          <>
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
          </>
        ),
      },
      {
        id: "state",
        titleKey: "step_animal_state",
        hintKey: "step_animal_state_hint",
        icon: "🩺",
        validate: () => true,
        isOptional: true,
        render: () => (
          <>
            <SelectField<AnimalStatus>
              label={t("animal_status")}
              value={status}
              onChange={setStatus}
              options={statusOptions}
            />
            <FormField
              label={t("animal_bcs")}
              hint={t("animal_bcs_hint")}
              value={bcs}
              onChangeText={setBcs}
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
          </>
        ),
      },
    ],
    [
      t,
      tagId,
      name,
      species,
      speciesOptions,
      sex,
      sexOptions,
      dateOfBirth,
      origin,
      originOptions,
      purchaseDate,
      purchasePrice,
      herdId,
      herdOptions,
      motherId,
      femaleOptions,
      fatherId,
      maleOptions,
      status,
      statusOptions,
      bcs,
      notes,
    ],
  );

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
    <Screen scroll={false} contentStyle={styles.noPadding}>
      <WizardForm
        steps={steps}
        onSubmit={onSubmit}
        submitting={submitting}
        submitLabel={submitLabel}
        errorMessage={submitError}
      />
      {mode === "edit" ? (
        <View
          style={[
            styles.deleteRow,
            { borderTopColor: colors.border, backgroundColor: colors.surface },
          ]}
        >
          <BigButton
            label={t("delete")}
            onPress={onDelete}
            variant="danger"
            style={styles.deleteBtn}
          />
        </View>
      ) : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  noPadding: { padding: 0 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  loadingText: { ...typography.body },
  deleteRow: {
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  deleteBtn: { alignSelf: "stretch" },
});
