// Site content that gets seeded into Postgres. Edit here, then run `npm run seed`.

const programs = [
  ['iron-foundations', 'Iron Foundations', 'strength', 'Strength', 'bar', 'Platform barbell work built around the squat, press and pull. Six athletes per coach, every set logged.', '60 min', 4, 'Mon, Wed, Fri 06:00', 'Arjun M.'],
  ['olympic-lifting-lab', 'Olympic Lifting Lab', 'strength', 'Strength', 'bolt', 'Snatch and clean and jerk technique on calibrated plates, with video review after each block.', '90 min', 5, 'Tue, Thu 18:30', 'Meera K.'],
  ['zone-2-engine', 'Zone 2 Engine', 'conditioning', 'Conditioning', 'pulse', 'Aerobic base work at 120 to 140 bpm on assault bikes and ski ergs. Quiet, steady and measured.', '50 min', 2, 'Daily 05:30', 'Rohan S.'],
  ['threshold-intervals', 'Threshold Intervals', 'conditioning', 'Conditioning', 'glove', 'Four-minute efforts at RPE 8 with timed rest, mixing sled, rower and bag rounds.', '45 min', 5, 'Tue, Sat 07:00', 'Rohan S.'],
  ['slow-flow-mobility', 'Slow Flow Mobility', 'mind', 'Mind and Body', 'arc', 'Loaded stretching and joint prep that keeps hips, shoulders and spine working under the bar.', '45 min', 1, 'Daily 07:30', 'Ananya R.'],
  ['reformer-pilates', 'Reformer Pilates', 'mind', 'Mind and Body', 'leaf', 'Spring-resistance reformer sessions for core control and posture. Eight beds, one instructor.', '55 min', 2, 'Mon to Sat 09:00', 'Ananya R.'],
  ['cryo-and-contrast', 'Cryo and Contrast', 'recovery', 'Recovery', 'snow', 'Three minutes in the minus 110 degree chamber, then 38 degree hydro and an infrared sauna.', '30 min', 1, 'By booking', 'Kabir A.'],
  ['sleep-and-breath-reset', 'Sleep and Breath Reset', 'recovery', 'Recovery', 'moon', 'Guided breathwork and a dim, warm room that helps late-evening athletes wind down properly.', '35 min', 1, 'Daily 21:00', 'Kabir A.'],
];

const trainers = [
  ['arjun-malhotra', 'Arjun Malhotra', 'AM', 'Head of Strength', '12 years coaching barbell sport. Runs the Iron Foundations block.', 'CSCS', '#4a3a18'],
  ['meera-kapoor', 'Meera Kapoor', 'MK', 'Olympic Lifting', 'Technique specialist for the snatch and clean and jerk.', 'USAW Level 2', '#3d2f1d'],
  ['rohan-sethi', 'Rohan Sethi', 'RS', 'Conditioning', 'Builds aerobic base and threshold work for athletes and desk-bound executives alike.', 'NSCA-CPT', '#43361a'],
  ['ananya-rao', 'Ananya Rao', 'AR', 'Mobility and Reformer', 'Leads Slow Flow and Reformer Pilates with a focus on lifter posture.', 'RYT-500', '#3a3018'],
  ['kabir-anand', 'Kabir Anand', 'KA', 'Recovery Lead', "Designs contrast and cryo protocols around each member's training week.", 'Recovery Specialist', '#31301f'],
  ['simran-gill', 'Simran Gill', 'SG', 'Performance Nutrition', 'Practical eating plans that fit training days, travel and long work weeks.', 'ISSN-CSSN', '#47351a'],
];

// Prices are in whole rupees per month. annual_price is the per-month rate when billed yearly.
const plans = [
  ['essence', 'Essence', 'Train', 14500, 12325, false,
    ['Full floor access 05:00 to 22:00', 'Unlimited group sessions', 'Locker and towel service'],
    ['Recovery wing', 'Personal training']],
  ['aurum', 'Aurum', 'Perform', 26000, 22100, true,
    ['All-hours access from 04:30', 'Unlimited group sessions', '2 personal sessions each month', '4 recovery visits each month', '2 guest passes each month'],
    []],
  ['obsidian', 'Obsidian', 'Reserve', 48000, 40800, false,
    ['Private locker suite', '8 personal sessions each month', 'Unlimited recovery wing', 'Quarterly body composition scan', 'Concierge booking'],
    []],
];

module.exports = { programs, trainers, plans };
