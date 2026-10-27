export const audioCache: {
  source(url: string): string;
  preload(url: string, isPublic?: boolean): Promise<boolean>;
  pin(owner: string, url: string): void;
  stop(): void;
  clearPrivate(): void;
};
