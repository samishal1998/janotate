export default {
  packageManager: 'npm',
  packages: { include: ['janotate'] },
  access: 'public',
  overrides: { dropFields: ['scripts', 'workspaces', 'publishConfig'] },
  verify: { enabled: true },
}
