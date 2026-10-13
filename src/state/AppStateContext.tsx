import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DbError,
  farmRepo,
  getDb,
  settingsRepo,
  type Farm,
  type RepoContext,
  type User,
} from "../db";

type Status = "loading" | "ready" | "error";

type AppStateValue = {
  readonly status: Status;
  readonly error: Error | null;
  readonly ctx: RepoContext | null;
  readonly activeFarm: Farm | null;
  readonly currentUser: User | null;
  readonly settings: Readonly<Record<string, unknown>>;
  readonly reload: () => Promise<void>;
  readonly refreshActiveFarm: () => Promise<void>;
  readonly refreshSettings: () => Promise<void>;
  readonly setCurrentUser: (user: User | null) => void;
};

const Ctx = createContext<AppStateValue | null>(null);

export const AppStateProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<Error | null>(null);
  const [ctx, setCtx] = useState<RepoContext | null>(null);
  const [activeFarm, setActiveFarm] = useState<Farm | null>(null);
  const [currentUser, setCurrentUserState] = useState<User | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  const bootstrap = useCallback(async (): Promise<void> => {
    setStatus("loading");
    setError(null);
    try {
      const db = await getDb();
      const repoCtx: RepoContext = { db, currentUserId: null };

      const [farm, loadedSettings] = await Promise.all([
        farmRepo.getActive(repoCtx),
        settingsRepo.getAll(repoCtx),
      ]);

      setCtx(repoCtx);
      setActiveFarm(farm);
      setSettings(loadedSettings);
      setStatus("ready");
    } catch (err) {
      const wrapped = err instanceof Error ? err : new DbError(String(err));
      setError(wrapped);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const refreshActiveFarm = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    try {
      const farm = await farmRepo.getActive(ctx);
      setActiveFarm(farm);
    } catch (err) {
      if (__DEV__) {
        console.warn("[appstate] refreshActiveFarm failed", err);
      }
    }
  }, [ctx]);

  const refreshSettings = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    try {
      const loaded = await settingsRepo.getAll(ctx);
      setSettings(loaded);
    } catch (err) {
      if (__DEV__) {
        console.warn("[appstate] refreshSettings failed", err);
      }
    }
  }, [ctx]);

  const setCurrentUser = useCallback((user: User | null): void => {
    setCurrentUserState(user);
    setCtx((prev) =>
      prev ? { ...prev, currentUserId: user?.id ?? null } : prev,
    );
  }, []);

  const value = useMemo<AppStateValue>(
    () => ({
      status,
      error,
      ctx,
      activeFarm,
      currentUser,
      settings,
      reload: bootstrap,
      refreshActiveFarm,
      refreshSettings,
      setCurrentUser,
    }),
    [
      status,
      error,
      ctx,
      activeFarm,
      currentUser,
      settings,
      bootstrap,
      refreshActiveFarm,
      refreshSettings,
      setCurrentUser,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useAppState = (): AppStateValue => {
  const value = useContext(Ctx);
  if (!value) {
    throw new Error("useAppState must be used inside <AppStateProvider>");
  }
  return value;
};
