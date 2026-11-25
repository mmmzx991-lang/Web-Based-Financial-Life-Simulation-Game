// Basic monthly living costs in sen, using the player's age in completed years.
export const livingCost = (age) =>
  age < 45 ? 200000 : age < 60 ? 300000 : 250000;
