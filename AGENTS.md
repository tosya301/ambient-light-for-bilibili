# 发布维护

用户已要求：以后每个 GitHub Release（包括预发布）都要同时提供同版本的 Chromium 包、Firefox 专用包和匹配源码包。执行 README「GitHub 发布约定」，不要遗漏 Firefox 附件。

Firefox 未签名 ZIP 面向临时体验。下载说明必须注明 `about:debugging#/runtime/this-firefox` 加载方式、最低 Firefox 版本，以及完全退出并重启后需要重新载入；不要将它描述为普通持久安装包或已通过商店审核。复用该版本已验证的产物，并核对上传后的文件哈希和公开下载链接。
