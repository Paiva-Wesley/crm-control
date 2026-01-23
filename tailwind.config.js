/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Dark theme clean
                dark: {
                    900: '#0f172a',
                    800: '#1e293b',
                    700: '#334155',
                    600: '#475569',
                },
                // Accent azul clean
                primary: {
                    DEFAULT: '#3b82f6',
                    dark: '#2563eb',
                    light: '#60a5fa',
                }
            },
        },
    },
    plugins: [],
}
