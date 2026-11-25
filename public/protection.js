// Amounts are in sen.
export const emergencyCover = {
  monthlyPremium: 9000,
  deductible: 20000,
  reimbursementRate: 0.8,
  payoutLimit: 200000,
};

export const emergencyReserve = (livingCost) => livingCost * 3;
