module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Required by react-native-reanimated 4 (worklets). Must be listed last.
    plugins: ['react-native-worklets/plugin'],
  };
};
