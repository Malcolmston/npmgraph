export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ?? 'https://eutrophic-latonya-unpotently.ngrok-free.dev/api';
// Web app base (for opening the full graph in a browser): API_BASE without the trailing /api
export const WEB_BASE = API_BASE.replace(/\/api\/?$/, '');
