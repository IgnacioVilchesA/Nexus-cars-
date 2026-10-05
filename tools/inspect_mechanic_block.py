from pathlib import Path

path = Path(r'C:\Users\pc\Desktop\Proyecto_Taller_mecanico\Taller mecanico\src\app\pages\mechanic-dashboard\mechanic-dashboard.component.ts')
text = path.read_text(encoding='utf-8')
start = text.index('  saveMechanicData(): void {')
end = text.index('  saveAdditionalWork(): void {', start) if '  saveAdditionalWork(): void {' in text[start:] else len(text)
print(text[start:end])
