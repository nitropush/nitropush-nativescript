module.exports = function ($projectData, hookArgs) {
  const platform = hookArgs.platform || hookArgs.prepareData?.platform;
  if (!platform) throw new Error('NativeScript prepare hook did not supply a platform');
  require('@nitropush/nativescript/scripts/prepare.cjs').prepare($projectData.projectDir, platform.toLowerCase());
};
