// Type declarations for CSS imports used by the Expo template (nativewind /
// react-native-css). Keeps `tsc --noEmit` clean; Metro handles the real import.
declare module '*.css';
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
