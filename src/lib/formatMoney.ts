export function formatMoney(value: number): string {
    const rounded = Math.ceil(value * 100) / 100;
    return rounded.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}
