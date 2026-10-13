import React, { useCallback, useEffect, useRef } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";

import { useTheme } from "../theme/ThemeContext";
import { radius, spacing, TOUCH_TARGET } from "../theme/colors";
import { typography } from "../theme/typography";
import type { Attachment } from "../db";
import { formatDuration } from "../utils/media";

type Props = {
  attachments: readonly Attachment[];
  onDelete?: (attachment: Attachment) => void;
};

const VoiceItem: React.FC<{
  attachment: Attachment;
  onDelete?: (attachment: Attachment) => void;
}> = ({ attachment, onDelete }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const playerRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.remove();
        } catch {
          // Player may already be disposed.
        }
        playerRef.current = null;
      }
    };
  }, []);

  const handlePlay = useCallback((): void => {
    Haptics.selectionAsync().catch(() => {});
    try {
      if (playerRef.current) {
        try {
          playerRef.current.remove();
        } catch {
          // ignore
        }
      }
      const next = createAudioPlayer(attachment.localPath);
      playerRef.current = next;
      next.play();
    } catch (err) {
      if (__DEV__) {
        console.warn("[AttachmentList] play failed", err);
      }
    }
  }, [attachment.localPath]);

  const handleDelete = useCallback((): void => {
    if (onDelete) onDelete(attachment);
  }, [attachment, onDelete]);

  const duration =
    attachment.durationMs != null
      ? formatDuration(attachment.durationMs)
      : null;

  return (
    <View
      style={[
        styles.item,
        { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
      ]}
    >
      <Pressable
        onPress={handlePlay}
        accessibilityRole="button"
        accessibilityLabel={t("play")}
        style={({ pressed }) => [
          styles.playButton,
          { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={[styles.playIcon, { color: colors.onPrimary }]}>▶</Text>
      </Pressable>
      <View style={styles.itemBody}>
        <Text style={[styles.itemTitle, { color: colors.text }]}>
          {t("att_voice")}
        </Text>
        {duration ? (
          <Text style={[styles.itemMeta, { color: colors.textMuted }]}>
            {duration}
          </Text>
        ) : null}
      </View>
      {onDelete ? (
        <Pressable
          onPress={handleDelete}
          accessibilityRole="button"
          accessibilityLabel={t("delete")}
          style={styles.deleteButton}
        >
          <Text style={[styles.deleteIcon, { color: colors.danger }]}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const PhotoItem: React.FC<{
  attachment: Attachment;
  onDelete?: (attachment: Attachment) => void;
}> = ({ attachment, onDelete }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const handleDelete = useCallback((): void => {
    if (onDelete) onDelete(attachment);
  }, [attachment, onDelete]);

  return (
    <View style={styles.photoWrap}>
      <Image
        source={{ uri: attachment.localPath }}
        style={[styles.photo, { backgroundColor: colors.surfaceAlt }]}
        resizeMode="cover"
      />
      {onDelete ? (
        <Pressable
          onPress={handleDelete}
          accessibilityRole="button"
          accessibilityLabel={t("delete")}
          style={[styles.photoDelete, { backgroundColor: colors.danger }]}
        >
          <Text style={[styles.deleteIcon, { color: colors.onDanger }]}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

export const AttachmentList: React.FC<Props> = ({ attachments, onDelete }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const photos = attachments.filter((a) => a.kind === "photo");
  const voices = attachments.filter((a) => a.kind === "voice");

  if (attachments.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, { color: colors.textMuted }]}>
        {t("attachments")}
      </Text>

      {photos.length > 0 ? (
        <View style={styles.photoGrid}>
          {photos.map((photo) => (
            <PhotoItem key={photo.id} attachment={photo} onDelete={onDelete} />
          ))}
        </View>
      ) : null}

      {voices.map((voice) => (
        <VoiceItem key={voice.id} attachment={voice} onDelete={onDelete} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  heading: { ...typography.label, marginBottom: spacing.sm },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  photoWrap: { position: "relative" },
  photo: { width: 100, height: 100, borderRadius: radius.md },
  photoDelete: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  item: {
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  playIcon: { fontSize: 22, marginLeft: 2 },
  itemBody: { flex: 1, gap: 2 },
  itemTitle: { ...typography.bodyBold },
  itemMeta: { ...typography.caption },
  deleteButton: { padding: spacing.sm },
  deleteIcon: { fontSize: 20, fontWeight: "700" },
});
