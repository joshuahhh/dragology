import RobotoMono from "./RobotoMono.ttf";

// Roboto Mono, as a variable font covering every weight
const style = document.createElement("style");
style.textContent = `
@font-face {
  font-family: 'Roboto Mono';
  src: url('${RobotoMono}') format('truetype');
  font-weight: 100 700;
  font-style: normal;
}`;
document.head.appendChild(style);

export const robotoMono = "'Roboto Mono', monospace";
