#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      #[cfg(target_os = "windows")]
      {
        use tauri::Manager;

        let window = app.get_webview_window("main").unwrap();
        // Mica (Windows 11) com fallback pra Acrylic em versões mais antigas do Windows 10 —
        // a janela precisa de `transparent: true` no tauri.conf.json pra isso ter efeito.
        if window_vibrancy::apply_mica(&window, None).is_err() {
          let _ = window_vibrancy::apply_acrylic(&window, Some((18, 18, 24, 125)));
        }
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
