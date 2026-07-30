import { runCountryHouseBookingLab } from "@/server/lab/country-house-booking";

const result = await runCountryHouseBookingLab();

console.log("Country-house booking lab completed");
console.log(JSON.stringify(result, null, 2));
