Unicode true
!define PRODUCT_NAME "كتابي"
!define PRODUCT_VERSION "1.0.0"
!define PRODUCT_PUBLISHER "Hamza AboSlema"

Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "Kitabi_Setup_${PRODUCT_VERSION}.exe"
InstallDir "$PROGRAMFILES64\Kitabi"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
ShowInstDetails show
ShowUnInstDetails show

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "kitabi app\*.*"
  CreateShortCut "$DESKTOP\كتابي.lnk" "$INSTDIR\Kitabi.exe" "" "$INSTDIR\Kitabi.exe" 0
  CreateDirectory "$SMPROGRAMS\كتابي"
  CreateShortCut "$SMPROGRAMS\كتابي\كتابي.lnk" "$INSTDIR\Kitabi.exe"
  CreateShortCut "$SMPROGRAMS\كتابي\إلغاء التثبيت.lnk" "$INSTDIR\uninstall.exe"
  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Kitabi" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Kitabi" "UninstallString" "$INSTDIR\uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Kitabi" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Kitabi" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Kitabi" "DisplayIcon" "$INSTDIR\Kitabi.exe"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\كتابي.lnk"
  RMDir /r "$SMPROGRAMS\كتابي"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Kitabi"
SectionEnd
