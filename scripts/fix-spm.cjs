// Capacitor 8 generates .v18 with Swift tools 5.9, where that enum is unavailable.
// The string version initializer supports the same minimum target with tools 5.9.
const fs = require('node:fs');
const path = 'ios/App/CapApp-SPM/Package.swift';
fs.writeFileSync(path, fs.readFileSync(path, 'utf8').replace('.iOS(.v18)', '.iOS("18.0")'));
