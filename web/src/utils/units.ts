export function c2f(celcius: number) {
  return celcius * 9/5 + 32;
}

export function f2c(fahrenheit: number) {
  return (fahrenheit - 32) * 5/9;
}

export function convertTemp(tempC: number, useFahrenheit: boolean) {
  return useFahrenheit ? c2f(tempC) : tempC;
}