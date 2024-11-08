import { create } from "zustand";

const useParamsStore = create(() => ({
  period1: 0,
  period2: 0,
  count: 0,
}));
export default useParamsStore;
