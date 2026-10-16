'use strict';
// Capacitor injects the bridge before bundled page scripts execute.
if (window.Capacitor?.isNativePlatform()) {
  const files = window.Capacitor.Plugins.Filesystem;
  const share = window.Capacitor.Plugins.Share;
  const clipboard = window.Capacitor.Plugins.Clipboard;
  window.JingduNative = {
    copy: text => clipboard.write({string:text}),
    async exportBackup(data, name) {
      const file = await files.writeFile({path:name, data, directory:'CACHE', encoding:'utf8'});
      try { await share.share({title:'静读笔记备份', files:[file.uri]}); }
      finally { await files.deleteFile({path:name, directory:'CACHE'}).catch(()=>{}); }
    }
  };
}
document.addEventListener('DOMContentLoaded', () => {
  const status = document.createElement('p');
  status.textContent = 'iOS 侧载版 1.0 · 经文已内置，断网可阅读和记笔记。助手与语音需要联网。更新 App 请安装新版 IPA；网页版更新不会自动替换此 App。';
  document.getElementById('about-dialog').append(status);
});
