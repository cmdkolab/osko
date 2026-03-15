#!/bin/bash
# ==========================================
# OS(KO) Kernel Builder
# Złączy wszystkie pliki jądra w jeden plik
# Wykonanie tego skryptu jest zalecane po każdej 
# modyfikacji w katalogu `system/`.
# ==========================================

OUTPUT_FILE="osko.min.js"

echo "🗑️  Usuwanie starego pliku $OUTPUT_FILE..."
rm -f $OUTPUT_FILE

echo "📦 Łączenie plików jądra..."

# Dokładna kolejność ładowania jest kluczowa dla działania jądra
FILES=(
    "i18n.js"
    "system/utils.js"
    "system/db.js"
    "system/storage.js"
    "system/state.js"
    "system/vfs.js"
    "system/syslog.js"
    "system/session.js"
    "system/eventbus.js"
    "system/notifications.js"
    "system/audio.js"
    "system/permissions.js"
    "system/ui.js"
    "system/windowmanager.js"
    "system/theme.js"
    "system/webos.js"
    "system/init.js"
)

# Loop po plikach i sklejenie
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "   -> Dodawanie $file"
        cat "$file" >> $OUTPUT_FILE
        # Dodanie nowej linii pomiędzy plikami naprawia braki enterów
        echo -e "\n" >> $OUTPUT_FILE 
    else
        echo "❌ BŁĄD: Nie znaleziono pliku $file!"
        exit 1
    fi
done

echo "✅ Zakończono łączenie JS! Plik wyjściowy: $OUTPUT_FILE"

# ==========================================
# CSS Builder
# ==========================================

CSS_OUTPUT_FILE="osko.min.css"

echo "🗑️  Usuwanie starego pliku $CSS_OUTPUT_FILE..."
rm -f $CSS_OUTPUT_FILE

echo "📦 Łączenie plików CSS..."

# Najpierw dodajemy główne style systemowe
echo "   -> Dodawanie style.css"
cat "style.css" >> $CSS_OUTPUT_FILE
echo -e "\n" >> $CSS_OUTPUT_FILE

# Listujemy wszystkie style.css z folderu apps (w głąb 1 poziomu)
for css_file in apps/*/style.css; do
    if [ -f "$css_file" ]; then
        echo "   -> Dodawanie $css_file"
        cat "$css_file" >> $CSS_OUTPUT_FILE
        echo -e "\n" >> $CSS_OUTPUT_FILE
    fi
done

echo "✅ Zakończono łączenie CSS! Plik wyjściowy: $CSS_OUTPUT_FILE"

echo "======================"
echo "Rozmiar osko.min.js:"
ls -lh $OUTPUT_FILE | awk '{print $5}'
echo "Rozmiar osko.min.css:"
ls -lh $CSS_OUTPUT_FILE | awk '{print $5}'
