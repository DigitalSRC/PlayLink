module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Required for react-native-reanimated/react-native-gesture-handler worklets (drag-and-drop
    // placement reordering in group-detail.tsx) — must stay last in the plugins list.
    plugins: ['react-native-worklets/plugin'],
  };
};
