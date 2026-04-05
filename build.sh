#!/bin/bash
set -e
OUTPUT_FILE="osko.min.js"
CSS_OUTPUT_FILE="osko.min.css"
echo "🗑️  Removing old file $OUTPUT_FILE..."
rm -f $OUTPUT_FILE
echo "🗑️  Removing old file $CSS_OUTPUT_FILE..."
rm -f $CSS_OUTPUT_FILE
echo "📦 Bundling kernel files..."
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
for file in "${FILES[@]}"; do
if [ -f "$file" ]; then
echo "   -> Adding $file"
cat "$file" >> $OUTPUT_FILE
echo -e "\n;" >> $OUTPUT_FILE
else
echo "❌ ERROR: File not found: $file!"
exit 1
fi
done
echo "✅ JS Bundling complete! Output file: $OUTPUT_FILE"
echo "📦 Bundling CSS files..."
if [ -f "style.css" ]; then
echo "   -> Adding style.css"
cat "style.css" >> $CSS_OUTPUT_FILE
echo -e "\n" >> $CSS_OUTPUT_FILE
else
echo "❌ ERROR: style.css not found!"
exit 1
fi
for css_file in apps/*/style.css; do
if [ -f "$css_file" ]; then
echo "   -> Adding $css_file"
cat "$css_file" >> $CSS_OUTPUT_FILE
echo -e "\n" >> $CSS_OUTPUT_FILE
fi
done
echo "✅ CSS Bundling complete! Output file: $CSS_OUTPUT_FILE"
echo "======================"
echo "Size of osko.min.js:"
du -h $OUTPUT_FILE | awk '{print $1}'
echo "Size of osko.min.css:"
du -h $CSS_OUTPUT_FILE | awk '{print $1}'