window.I18n = {
    current: localStorage.getItem('OSKO:LANG') || 'en',
    dicts: {
        en: {
            // System UI
            'system.search_placeholder': 'Search apps and files...',
            'system.search_tooltip': 'Search (Ctrl+Space)',
            'system.switcher_tooltip': 'Task View (Multitasking)',
            'system.hdd_usage': 'Disk Usage',
            // Context Menus
            'menu.terminate': 'Terminate',
            'menu.close_all': 'Close All',
            'menu.refresh': 'Refresh',
            'menu.lock_system': 'Lock System',
            'menu.personalize': 'Personalize',
            'menu.settings': 'Settings',
            'menu.new_note': 'New Note',
            'menu.shutdown': 'Shutdown',
            // Dialogs
            'dialog.ok': 'OK',
            'dialog.cancel': 'Cancel',
            'dialog.close_all_confirm': 'Are you sure you want to close all applications?',
            'dialog.file_exists': 'File "{0}" already exists. What do you want to do?',
            'dialog.replace': 'Replace',
            'dialog.copy': 'Create Copy',
            'dialog.error': 'Unexpected error occurred: {0}...',
            'dialog.db_fallback': 'Your browser does not support IndexedDB or access is blocked. System will run in read-only mode.',
            'dialog.quota_exceeded': 'Storage limit for application {0} has been exceeded.',
            // Apps
            // Explorer
            'explorer.title': 'Explorer',
            'explorer.new_folder': 'New Folder',
            'explorer.new_file': 'New File',
            'explorer.paste': 'Paste',
            'explorer.open': 'Open',
            'explorer.rename': 'Rename',
            'explorer.delete': 'Delete',
            'explorer.copy': 'Copy',
            'explorer.cut': 'Cut',
            'explorer.properties': 'Properties',
            'explorer.confirm_delete': 'Are you sure you want to delete {0}?',
            'explorer.prompt_folder_name': 'Folder name:',
            'explorer.prompt_file_name': 'File name:',
            'explorer.prompt_rename': 'New name for {0}:',
            // Settings
            'settings.title': 'Settings',
            'settings.tab_personalization': 'Personalization',
            'settings.tab_system': 'System',
            'settings.tab_about': 'About System',
            'settings.theme_light': 'Light',
            'settings.theme_dark': 'Dark',
            'settings.theme_auto': 'Auto',
            'settings.wallpaper_url': 'Wallpaper URL:',
            'settings.clear_data': 'Clear User Data',
            'settings.clear_data_confirm': 'Are you sure you want to clear all user data and restore system to factory settings?',
            'settings.language': 'Language:',
            'settings.sound': 'System Sound',
            'settings.sound_on': 'On',
            'settings.sound_off': 'Off',
            'settings.kernel_status': 'Kernel Status',
            'settings.ok': 'OK',
            'settings.autostart': 'Autostart',
            'settings.wallpaper_changed': 'Wallpaper changed.',
            'settings.theme_changed': 'Theme changed to:',
            'explorer.wallpaper_success': 'Wallpaper updated.',
            'explorer.wallpaper_invalid': 'This file cannot be used as wallpaper.',

            // Syslog
            'syslog.title': 'Syslog',
            'syslog.clear': 'Clear',
            'syslog.confirm_clear': 'Are you sure you want to clear the logs?',
            'syslog.no_logs': 'No logs available.',

            // Calculator
            'calculator.title': 'Calculator',

            // Task Manager
            'taskmanager.title': 'Task Manager',
            'taskmanager.app': 'Application',
            'taskmanager.status': 'Status',
            'taskmanager.memory': 'Memory',
            'taskmanager.dom': 'DOM',
            'taskmanager.action': 'Action',
            'taskmanager.uptime': 'Uptime',

            // About
            'about.title': 'OS(KO)',
            'about.desc': 'Advanced browser-based operating system.',
            'about.version': 'Version',
            'about.uptime': 'Uptime',

            // Terminal
            'terminal.title': 'Terminal',
            'terminal.welcome': "Type 'help' to see a list of commands.",
            'terminal.help': 'Available commands: ls, cd, cat, edit, mkdir, rm, clear, echo, date, pwd, help, version, play, uptime, ps',
            'terminal.error': 'Error',
            'terminal.not_found': 'Not found',
            'terminal.read_error': 'Read error',
            'terminal.is_dir': 'Is a directory',

            // Notes
            'notes.title': 'Notes',
            'notes.new': 'New',
            'notes.save': 'Save',
            'notes.wrap': 'Wrap',
            'notes.export': 'Export',
            'notes.unsaved': 'Unsaved',
            'notes.placeholder': 'Start typing...',
            'notes.saving': 'Saving...',
            'notes.modified': 'Modified (no file)',
            'notes.unsaved_confirm': 'You have unsaved changes. Are you sure you want to create a new file?',
            'notes.new_file': 'New file',
            'notes.auto_saved': 'Changes have been automatically saved.',
            'notes.confirm_close': 'You have unsaved changes. Close without saving?',
            'notes.confirm_open': 'You have unsaved changes. Discard them and open the file?'
        },
        pl: {
            'system.search_placeholder': 'Szukaj aplikacji i plików...',
            'system.search_tooltip': 'Szukaj (Ctrl+Space)',
            'system.switcher_tooltip': 'Widok zadań (Multitasking)',
            'system.hdd_usage': 'Zajętość dysku',

            'menu.terminate': 'Zakończ',
            'menu.close_all': 'Zamknij wszystkie',
            'menu.refresh': 'Odśwież',
            'menu.lock_system': 'Zablokuj system',
            'menu.personalize': 'Personalizuj',
            'menu.settings': 'Ustawienia',
            'menu.new_note': 'Nowa notatka',
            'menu.shutdown': 'Wyłącz',

            'dialog.ok': 'OK',
            'dialog.cancel': 'Anuluj',
            'dialog.close_all_confirm': 'Czy na pewno chcesz zamknąć wszystkie aplikacje?',
            'dialog.file_exists': 'Plik "{0}" już istnieje. Co chcesz zrobić?',
            'dialog.replace': 'Zastąp',
            'dialog.copy': 'Utwórz kopię',
            'dialog.error': 'Wystąpił nieoczekiwany błąd: {0}...',
            'dialog.db_fallback': 'Twoja przeglądarka nie obsługuje IndexedDB lub dostęp został zablokowany. System będzie działać w trybie "tylko do odczytu".',
            'dialog.quota_exceeded': 'Limit miejsca dla aplikacji {0} został wyczerpany.',

            'explorer.title': 'Eksplorator plików',
            'explorer.new_folder': 'Nowy folder',
            'explorer.new_file': 'Nowy plik',
            'explorer.paste': 'Wklej',
            'explorer.open': 'Otwórz',
            'explorer.rename': 'Zmień nazwę',
            'explorer.delete': 'Usuń',
            'explorer.copy': 'Kopiuj',
            'explorer.cut': 'Wytnij',
            'explorer.properties': 'Właściwości',
            'explorer.confirm_delete': 'Czy na pewno chcesz usunąć {0}?',
            'explorer.prompt_folder_name': 'Nazwa folderu:',
            'explorer.prompt_file_name': 'Nazwa pliku:',
            'explorer.prompt_rename': 'Nowa nazwa dla {0}:',

            'settings.title': 'Ustawienia',
            'settings.tab_personalization': 'Personalizacja',
            'settings.tab_system': 'System',
            'settings.tab_about': 'O systemie',
            'settings.theme_light': 'Jasny',
            'settings.theme_dark': 'Ciemny',
            'settings.theme_auto': 'Auto',
            'settings.wallpaper_url': 'URL Tapety (obraz lub GIF):',
            'settings.clear_data': 'Usuń dane użytkownika',
            'settings.clear_data_confirm': 'Czy na pewno chcesz usunąć wszystkie dane użytkownika i przywrócić system do ustawień fabrycznych?',
            'settings.language': 'Język:',
            'settings.sound': 'Dźwięk Systemu',
            'settings.sound_on': 'Włączony',
            'settings.sound_off': 'Wyłączony',
            'settings.kernel_status': 'Status jądra',
            'settings.ok': 'OK',
            'settings.autostart': 'Autostart',
            'settings.wallpaper_changed': 'Zmieniono tapetę.',
            'settings.theme_changed': 'Ustawiono motyw:',
            'explorer.wallpaper_success': 'Tapeta została zaktualizowana.',
            'explorer.wallpaper_invalid': 'Ten plik nie może być tapetą.',

            // Syslog
            'syslog.title': 'Logi systemowe',
            'syslog.clear': 'Wyczyść',
            'syslog.confirm_clear': 'Czy na pewno wyczyścić logi?',
            'syslog.no_logs': 'Brak logów.',

            // Calculator
            'calculator.title': 'Kalkulator',

            // Task Manager
            'taskmanager.title': 'Menedżer zadań',
            'taskmanager.app': 'Aplikacja',
            'taskmanager.status': 'Status',
            'taskmanager.memory': 'Pamięć',
            'taskmanager.dom': 'DOM',
            'taskmanager.action': 'Akcja',
            'taskmanager.uptime': 'Uptime',

            // About
            'about.title': 'OS(KO)',
            'about.desc': 'Zaawansowany system operacyjny w przeglądarce.',
            'about.version': 'Wersja',
            'about.uptime': 'Uptime',

            // Terminal
            'terminal.title': 'Terminal',
            'terminal.welcome': "Wpisz 'help', aby uzyskać listę komend.",
            'terminal.help': 'Dostępne komendy: ls, cd, cat, edit, mkdir, rm, clear, echo, date, pwd, help, version, play, uptime, ps',
            'terminal.error': 'Błąd',
            'terminal.not_found': 'Nie znaleziono',
            'terminal.read_error': 'Błąd odczytu',
            'terminal.is_dir': 'Jest folderem',

            // Notes
            'notes.title': 'Notatnik',
            'notes.new': 'Nowy',
            'notes.save': 'Zapisz',
            'notes.wrap': 'Zawijanie',
            'notes.export': 'Eksportuj',
            'notes.unsaved': 'Niezapisany',
            'notes.placeholder': 'Zacznij pisać...',
            'notes.saving': 'Zapisuję...',
            'notes.modified': 'Zmodyfikowano (brak pliku)',
            'notes.unsaved_confirm': 'Masz niezapisane zmiany. Czy na pewno chcesz utworzyć nowy plik?',
            'notes.new_file': 'Nowy plik',
            'notes.auto_saved': 'Zmiany zostały automatycznie zapisane.',
            'notes.confirm_close': 'Masz niezapisane zmiany. Zamknąć bez zapisywania?',
            'notes.confirm_open': 'Masz niezapisane zmiany. Porzucić je i otworzyć plik?'
        }
    },
    t(key, ...args) {
        let text = this.dicts[this.current]?.[key] || this.dicts['en']?.[key] || key;
        args.forEach((arg, i) => {
            text = text.replace(`{${i}}`, arg);
        });
        return text;
    },
    setLanguage(lang) {
        if (this.dicts[lang]) {
            this.current = lang;
            localStorage.setItem('OSKO:LANG', lang);
            window.dispatchEvent(new CustomEvent('i18n:changed', { detail: lang }));
        }
    }
};
