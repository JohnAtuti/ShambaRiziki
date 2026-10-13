import React, { useCallback, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import { AudioModule, RecordingPresets, useAudioRecorder } from "expo-audio";
import * as Haptics from "expo-haptics";

import { BigButton } from "./BigButton";
import { useTheme } from "../theme/ThemeContext";
import { spacing } from "../theme/colors";
import { typography } from "../theme/typography";

export type PickedPhoto = {
  uri: string;
  mimeType: string;
};

export type PickedVoice = {
  uri: string;
  durationMs: number;
  mimeType: string;
};

type Props = {
  onPhotoPicked: (photo: PickedPhoto) => void;
  onVoicePicked: (voice: PickedVoice) => void;
  onError?: (message: string) => void;
};

export const AttachmentPicker: React.FC<Props> = ({
  onPhotoPicked,
  onVoicePicked,
  onError,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(
    null,
  );

  const ensureCameraPermission = useCallback(async (): Promise<boolean> => {
    const current = await ImagePicker.getCameraPermissionsAsync();
    if (current.granted) return true;
    const next = await ImagePicker.requestCameraPermissionsAsync();
    if (!next.granted) {
      Alert.alert(t("camera_permission_title"), t("camera_permission_message"));
      return false;
    }
    return true;
  }, [t]);

  const ensureLibraryPermission = useCallback(async (): Promise<boolean> => {
    const current = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (current.granted) return true;
    const next = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!next.granted) {
      Alert.alert(
        t("library_permission_title"),
        t("library_permission_message"),
      );
      return false;
    }
    return true;
  }, [t]);

  const ensureMicPermission = useCallback(async (): Promise<boolean> => {
    const next = await AudioModule.requestRecordingPermissionsAsync();
    if (!next.granted) {
      Alert.alert(
        t("microphone_permission_title"),
        t("microphone_permission_message"),
      );
      return false;
    }
    return true;
  }, [t]);

  const handleTakePhoto = useCallback(async (): Promise<void> => {
    Haptics.selectionAsync().catch(() => {});
    try {
      if (!(await ensureCameraPermission())) return;
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        allowsEditing: false,
      });
      if (result.canceled || result.assets.length === 0) return;
      const asset = result.assets[0];
      onPhotoPicked({
        uri: asset.uri,
        mimeType: asset.mimeType ?? "image/jpeg",
      });
    } catch (err) {
      if (__DEV__) {
        console.warn("[AttachmentPicker] take photo failed", err);
      }
      onError?.(t("permission_denied"));
    }
  }, [ensureCameraPermission, onError, onPhotoPicked, t]);

  const handleChoosePhoto = useCallback(async (): Promise<void> => {
    Haptics.selectionAsync().catch(() => {});
    try {
      if (!(await ensureLibraryPermission())) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.7,
        allowsEditing: false,
      });
      if (result.canceled || result.assets.length === 0) return;
      const asset = result.assets[0];
      onPhotoPicked({
        uri: asset.uri,
        mimeType: asset.mimeType ?? "image/jpeg",
      });
    } catch (err) {
      if (__DEV__) {
        console.warn("[AttachmentPicker] choose photo failed", err);
      }
      onError?.(t("permission_denied"));
    }
  }, [ensureLibraryPermission, onError, onPhotoPicked, t]);

  const handleToggleRecording = useCallback(async (): Promise<void> => {
    Haptics.selectionAsync().catch(() => {});
    try {
      if (recording) {
        await recorder.stop();
        const uri = recorder.uri;
        const durationMs =
          recordingStartedAt != null ? Date.now() - recordingStartedAt : 0;
        setRecording(false);
        setRecordingStartedAt(null);
        if (uri) {
          onVoicePicked({
            uri,
            durationMs,
            mimeType: "audio/m4a",
          });
        }
        return;
      }

      if (!(await ensureMicPermission())) return;
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      setRecordingStartedAt(Date.now());
    } catch (err) {
      if (__DEV__) {
        console.warn("[AttachmentPicker] record failed", err);
      }
      setRecording(false);
      setRecordingStartedAt(null);
    }
  }, [
    ensureMicPermission,
    onVoicePicked,
    recorder,
    recording,
    recordingStartedAt,
  ]);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, { color: colors.textMuted }]}>
        {t("attachments")}
      </Text>

      <View style={styles.row}>
        <BigButton
          label={t("take_photo")}
          icon={<Text style={styles.icon}>📷</Text>}
          onPress={() => void handleTakePhoto()}
          variant="secondary"
          style={styles.button}
        />
        <BigButton
          label={t("choose_from_library")}
          icon={<Text style={styles.icon}>🖼️</Text>}
          onPress={() => void handleChoosePhoto()}
          variant="secondary"
          style={styles.button}
        />
      </View>

      <BigButton
        label={recording ? t("stop_recording") : t("add_voice_note")}
        icon={<Text style={styles.icon}>{recording ? "⏹" : "🎤"}</Text>}
        onPress={() => void handleToggleRecording()}
        variant={recording ? "danger" : "secondary"}
        style={styles.voiceButton}
      />

      {recording ? (
        <Text style={[styles.recording, { color: colors.danger }]}>
          {t("recording")}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  heading: { ...typography.label, marginBottom: spacing.sm },
  row: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  button: { flex: 1 },
  voiceButton: { marginBottom: spacing.sm },
  icon: { fontSize: 24 },
  recording: {
    ...typography.caption,
    textAlign: "center",
    marginTop: spacing.xs,
  },
});
