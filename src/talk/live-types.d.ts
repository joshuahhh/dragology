declare module "virtual:live-types" {
  /** Path in the TypeScript service's file system → contents. */
  const files: Record<string, string>;
  export default files;
}
