/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans KR"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      keyframes: {
        // 온천천 수달 미션 — 화면을 가로지르며 떠다닙니다.
        floatOtter: {
          '0%':   { transform: 'translateX(-15%) translateY(0px) rotate(-5deg)' },
          '50%':  { transform: 'translateX(45%) translateY(12px) rotate(5deg)' },
          '100%': { transform: 'translateX(105%) translateY(-5px) rotate(-3deg)' },
        },
      },
      animation: {
        otter: 'floatOtter 6.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
