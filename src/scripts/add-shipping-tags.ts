#!/usr/bin/env node

/**
 * Script to add shipping tags to products based on handle
 *
 * Reads from a CSV file with columns: Handle, Tags
 * Adds the specified tag(s) to each product without removing existing tags
 *
 * Usage:
 *   npx tsx src/scripts/add-shipping-tags.ts                    # Execute changes
 *   npx tsx src/scripts/add-shipping-tags.ts --dry-run          # Preview only
 */

import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const DRY_RUN = process.argv.includes('--dry-run');

// CSV data embedded directly (from products_shipping_tags_update.csv)
const CSV_DATA = `Handle,Tags
honda-cb1000-hornet-sp,Shipping_NoFreight
honda-hpg6000r-d-avr-generator,Shipping_68
honda-izy-onâ¢-hrg416-mower-kit-includes-4ah-battery-charger,Shipping_89
honda-izy-on-hrg466-mower-kit-includes-6ah-battery-charger,Shipping_89
honda-hhc36bxb-battery-chainsaw-kit-includes-4ah-battery-charger,Shipping_68
honda-hht36bxb-battery-lawn-trimmer-kit-includes-4ah-battery-charger,Shipping_68
honda-hht36-battery-brush-cutter-kit-includes-6ah-battery-charger,Shipping_68
honda-hhh36bxb-battery-hedge-trimmer-kit-includes-4ah-battery-charger,Shipping_68
honda-hhh36-battery-hedge-trimmer-kit-includes-6ah-battery-charger,Shipping_68
honda-hhb36bxb-battery-blower-kit-includes-4ah-battery-charger,Shipping_68
honda-hhb36-battery-blower-kit-includes-6ah-battery-charger,Shipping_68
honda-bf2-4,Shipping_NoFreight
honda-trolling-switch-dbw,Shipping_4999
honda-switch-panel-key-start-horizontal-drive-by-wire,Shipping_1495
honda-switch-panel-twin-rig-start-button,Shipping_4999
honda-switch-panel-key-start-vertical-drive-by-wire,Shipping_4999
honda-honda-mfd-4-3-digital-display-bf115-350-dbw,Shipping_4999
honda-honda-marine-10-litre-dry-bag,Shipping_1495
honda-transalp-pannier-support-stay,Shipping_68
honda-honda-bucket-hat,Shipping_1495
honda-honda-black-travel-mug-750ml,Shipping_1495
honda-honda-black-cap,Shipping_1495
honda-honda-navy-cap,Shipping_1495
honda-honda-camo-cap,Shipping_1495
honda-honda-red-wing-cap,Shipping_1495
honda-hrc-umbrella,Shipping_1495
honda-hrc-red-t-shirt,Shipping_1495
honda-honda-black-retro-t-shirt,Shipping_1495
honda-honda-grey-t-shirt,Shipping_1495
honda-honda-black-t-shirt,Shipping_1495
honda-hrc-navy-red-polo,Shipping_1495
honda-honda-black-polo,Shipping_1495
honda-honda-pit-crew-shirt-black-red,Shipping_1495
honda-hrc-navy-red-hoodie,Shipping_1495
honda-qp205e-2-high-pressure-framed-pump,Shipping_1495
honda-honda-red-kids-cap,Shipping_1495
honda-cb1000f,Shipping_NoFreight
honda-nx500-top-box-base,Shipping_4999
honda-3l-tank-bag,Shipping_4999
honda-africa-twin-backrest-for-58l-top-box,Shipping_4999
honda-africa-twin-adventure-sports-main-centre-stand,Shipping_68
honda-pioneer-1000-5p-1,Shipping_NoFreight
honda-crf300f,Shipping_NoFreight
honda-trx420fa6,Shipping_NoFreight
honda-cb750-hornet-1,Shipping_NoFreight
honda-crf1100-africa-twin,Shipping_NoFreight
honda-cb650r-e-clutch,Shipping_NoFreight
hrx217-lawn-mower,Shipping_89
home-start-kit-for-eu70is-with-32amp-plug,Shipping_1495
gx50-engine,Shipping_4999
tow-hitch-for-honda-ride-on-hf2315-hf2417-hf2622,Shipping_1495
discharge-chute-deflector-for-hf2417-hf2622,Shipping_1495
5-litre-plastic-fuel-container,Shipping_1495
9ah-battery-charger-combo,Shipping_1495
6ah-battery-charger-combo,Shipping_1495
4ah-battery-charger-combo,Shipping_1495
hht36bxb-battery-lawn-trimmer,Shipping_68
hhb36bxb-battery-blower,Shipping_68
hhh36bxb-battery-hedge-trimmer,Shipping_68
4-amp-battery-fast-charger-combo,Shipping_1495
hhc36bxb-battery-chainsaw,Shipping_68
up650-2-high-pressure-water-pump,Shipping_89
honda-gx200-horizontal-shaft-engine,Shipping_4999
gxh50-horizontal-shaft-engine,Shipping_4999
bluebird-ps22-18-pruning-shear,Shipping_1495
bluebird-cs-22-04-battery-pruner,Shipping_1495
wb20-2-water-pump,Shipping_89
eg5500cxs-industrial-framed-generator,Shipping_68
honda-brutility-gloves,Shipping_1495
gxv690-vertical-shaft-engine,Shipping_4999
400mm-extension-for-phb35-phb50,Shipping_1495
umk435-bull-handle-brush-cutter,Shipping_68
umk450-bull-handle-brush-cutter,Shipping_68
umk435-loop-handle-brush-cutter,Shipping_68
hht36-battery-powered-brush-cutter,Shipping_68
umk425-loop-handle-25cc-brushcutter,Shipping_68
ums425-loop-handle-curved-shaft-line-trimmer,Shipping_1495
12-auger-300-x-800mm,Shipping_68
4-auger-100-x-800mm,Shipping_68
honda-versattach-extension-pole-attachment,Shipping_68
honda-versattach-cultivator-attachment,Shipping_68
honda-versattach-edger-attachment,Shipping_68
honda-versattach-pruner-attachment,Shipping_68
honda-versattach-long-hedge-trimmer-attachment,Shipping_68
honda-versattach-short-hedge-trimmer-attachment,Shipping_68
honda-versattach-blower-attachment,Shipping_68
honda-versattach-brush-cutter-attachment,Shipping_68
35cc-honda-versattach-powerhead,Shipping_68
25cc-honda-versattach-powerhead,Shipping_68
8-auger-200-x-800mm,Shipping_68
6-auger-150-x-800mm,Shipping_68
eu70-liftinghanging-hook,Shipping_1495
eu30is-wheel-kit-4-wheels-with-locking-front-casters,Shipping_1495
wheel-kit-4-wheels-for-eg-generators,Shipping_1495
security-cable-with-led-light-combination-lock,Shipping_1495
honda-security-cable,Shipping_1495
honda-175-litre-pop-up-grass-bag,Shipping_1495
honda-safety-glasses,Shipping_1495
honda-brushcutter-chaps,Shipping_1495
honda-high-vis-safety-vest,Shipping_1495
honda-helmet-with-face-shield-and-ear-muffs,Shipping_1495
honda-head-band-ear-muffs,Shipping_1495
high-pressure-pump-roll-frame-suitable-for-qp205-and-up650,Shipping_68
4-tooth-metal-blade-curved-cutting-edge-umc-and-umk,Shipping_1495
8-tooth-metal-blade-umc-and-umk,Shipping_1495
4-tooth-metal-blade-straight-cutting-edge-umc-and-umk,Shipping_1495
scallop-tooth-metal-blade,Shipping_1495
3-tooth-metal-blade-umc-and-umk,Shipping_1495
blade-kit-for-umk425l-and-umc-versatool,Shipping_1495
brush-cutter-service-kit,Shipping_1495
large-speed-feed-head-heavy-duty-w5,Shipping_1495
small-speed-feed-head-heavy-duty-w4,Shipping_1495
small-speed-feed-head-heavy-duty-w4-umc-425435-umk425435,Shipping_1495
round-trimmer-line-27mm-x-153m,Shipping_1495
round-trimmer-line-27mm-x-68m,Shipping_1495
round-trimmer-line-27mm-x-33m,Shipping_1495
round-trimmer-line-27mm-x-18m,Shipping_1495
round-trimmer-line-24mm-x-193m,Shipping_1495
round-trimmer-line-24mm-x-87m,Shipping_1495
round-trimmer-line-24mm-x-43m,Shipping_1495
round-trimmer-line-24mm-x-21m,Shipping_1495
round-trimmer-line-20mm-x-62m,Shipping_1495
round-trimmer-line-20mm-x-30m,Shipping_1495
fuel-stabilizer-236ml-bottle,Shipping_1495
honda-10w30-oil-4-litre-bottle,Shipping_1495
honda-10w30-oil-1-litre-bottle,Shipping_1495
hru196m2-full-4-blade-kit-with-bolts-2x-hi-2x-lo,Shipping_1495
honda-hru216m2-full-4-blade-kit-with-bolts,Shipping_1495
21-high-lift-lawnmower-blades-hru216d-hru217d-hrj216,Shipping_1495
19-high-lift-lawnmower-blades-pair-wbolts-hru19d-hru196d-hrj196,Shipping_1495
lawn-mower-service-kit-3,Shipping_1495
lawn-mower-service-kit-hru19d1-hru19r1-hru197-hru197d-hru217d,Shipping_1495
eu20i-eu22i-generator-service-kit,Shipping_1495
eu10i-generator-service-kit,Shipping_1495
parallel-connection-cord-for-joining-2x-eu10it-2x-eu20it-2-x-eu22it,Shipping_1495
generator-mat,Shipping_1495
eu70is-cover,Shipping_1495
eu32i-cover,Shipping_1495
eu30is-cover,Shipping_1495
eu20-eu22-red-cover,Shipping_1495
eu10i-red-cover,Shipping_1495
eu20-eu22-dust-cover,Shipping_1495
lawn-mower-service-kit-hru196-hru196d-hru216d,Shipping_1495
eu10i-dust-cover,Shipping_1495
hp500-power-carrier,Shipping_NoFreight
10-auger-250-x-800mm,Shipping_68
hhh36-battery-powered-hedge-trimmer,Shipping_68
hhb36-battery-blower,Shipping_68
36v-4ah-battery,Shipping_1495
36v-9ah-battery,Shipping_1495
36v-6ah-battery,Shipping_1495
36v-fast-battery-charger,Shipping_1495
izy-on-hrg466-mower,Shipping_89
izy-on-hrg416-16-battery-powered-lawn-mower,Shipping_89
eu32i-inverter-generator,Shipping_68
eu70is-32amp-plug,Shipping_68
honda-hhb25-blower,Shipping_68
honda-frc800k1-tiller,Shipping_89
phb50-post-hole-borer,Shipping_89
gcv200-engine,Shipping_1495
gxv630-engine,Shipping_4999
honda-gxv390-vertical-shaft-engine,Shipping_4999
honda-gxv160-vertical-shaft-engine,Shipping_4999
honda-igx800-horizontal-shaft-engine,Shipping_4999
honda-gx690-horizontal-shaft-v-twin-engine,Shipping_4999
honda-gx630-horizontal-shaft-v-twin-engine,Shipping_4999
honda-gx390-horizontal-shaft-engine,Shipping_4999
honda-gx270-horizontal-shaft-engine,Shipping_4999
honda-gx120-horizontal-shaft-engine,Shipping_4999
honda-gp200-horizontal-shaft-engine,Shipping_4999
gp160-horizontal-shaft-engine,Shipping_4999
honda-gx50-horizontal-shaft-engine,Shipping_4999
gx35-mini-4-stroke-horizontal-shaft-engine,Shipping_4999
hf2625-ride-on-mower,Shipping_NoFreight
hf2417-ride-on-mower,Shipping_NoFreight
honda-rpp3pumpe-3-electric-start-light-chemical-pump,Shipping_89
honda-rpp2pumpe-2-light-chemical-pump-with-electric-start,Shipping_89
honda-rpp3pump-self-priming-centrifugal-light-chemical-pump,Shipping_89
honda-rpp2pump-light-chemical-pump-recoil-pull-start,Shipping_89
qp205-2-high-pressure-pump,Shipping_89
wt30-3-trash-pump,Shipping_89
wt20-2-trash-water-pump,Shipping_89
honda-wb30-3-water-pump,Shipping_89
wx15-15-water-pump,Shipping_89
wx10-1-water-pump,Shipping_89
honda-hru216m3-lawn-mower,Shipping_89
honda-hru196m2-contractor-ready-push-mower,Shipping_89
honda-hrx217-premium-domestic-self-propelled-lawn-mower,Shipping_89
honda-hru19m2-premium-domestic-push-lawn-mower,Shipping_89
honda-hpm18200-lawn-mower,Shipping_89
eu70is-32amp-plug-with-auto-start,Shipping_68
eu70is-inverter-generator,Shipping_68
honda-eu30is-inverter-generator,Shipping_68
eu10i-inverter-generator,Shipping_68
eu22i-inverter-generator,Shipping_68
honda-marine-prop-bag,Shipping_1495
honda-marine-hutchwilco-life-jacket,Shipping_4999
icey-tek-70l-chilly-bin,Shipping_4999
honda-marine-camo-cap,Shipping_1495
honda-marine-floating-keyring,Shipping_1495
bf115-bf135-bf150-vented-cover,Shipping_4999
bf60-power-thrust-vented-cover,Shipping_4999
bf30-vented-cover,Shipping_4999
bf15-bf20-vented-cover,Shipping_4999
bf8-bf9-bf10-vented-cover,Shipping_4999
bf2-3-vented-cover,Shipping_4999
bf175-bf200-bf225-bf250-vented-cover-d-series,Shipping_4999
bf75-bf80-bf90-bf100-vented-cover,Shipping_4999
bf40-bf50-vented-cover,Shipping_4999
bf4-bf5-bf6-vented-cover,Shipping_4999
switch-panel-triple-rig-start-button,Shipping_4999
ignition-switch-mechanical,Shipping_4999
two-piece-ignition-switch-mechanical,Shipping_4999
switch-panel-on-off-vertical-drive-by-wire,Shipping_4999
switch-panel-on-off-horizontal-drive-by-wire,Shipping_4999
triple-trim-tilt,Shipping_4999
dual-trim-tilt,Shipping_4999
switch-panel-single-start-button,Shipping_4999
analogue-fuel-gauge,Shipping_1495
analogue-tacho-hour-gauge,Shipping_4999
analogue-speedo-gauge,Shipping_4999
analogue-trim-gauge,Shipping_4999
analogue-gauge-set-mechanical,Shipping_4999
veethree-digital-speedo-70-knots,Shipping_4999
veethree-digital-tacho,Shipping_4999
vmh35-hybrid-display,Shipping_4999
garmin-gmi20-digital-gauge,Shipping_4999
honda-mfd-7-0-digital-display-bf40-bf250,Shipping_4999
honda-mfd-4-3-digital-display-bf40-bf250,Shipping_4999
honda-7-0-multi-function-display-bf115-bf350-dbw,Shipping_4999
honda-mfd-4-3-digital-display-bf115-350-dbw,Shipping_4999
twin-binnacle-console-remote-mechanical,Shipping_4999
flush-side-mount-remote-mechanical,Shipping_4999
left-hand-single-binnacle-console-remote-mechanical,Shipping_4999
right-hand-single-binnacle-console-remote-mechanical,Shipping_4999
standard-side-mount-remote-with-trolling-switch-mechanical,Shipping_4999
standard-side-mount-remote-mechanical,Shipping_4999
flush-mount-remote-bf115-bf350-drive-by-wire,Shipping_4999
twin-binnacle-console-remote-bf115-bf350-drive-by-wire,Shipping_4999
twin-binnacle-console-remote-drive-by-wire-d-series,Shipping_4999
flush-side-mount-remote-drive-by-wire-d-series,Shipping_4999
single-binnacle-console-remote-drive-by-wire-d-series,Shipping_4999
single-binnacle-console-remote-bf115-bf350-drive-by-wire,Shipping_4999
honda-bf2-3-outboard-motor,Shipping_NoFreight
honda-bf8-outboard-motor,Shipping_NoFreight
honda-bf10-outboard-motor,Shipping_NoFreight
honda-bf15-outboard-motor-20-shaft,Shipping_NoFreight
honda-bf15-outboard-motor-15-shaft,Shipping_NoFreight
honda-bf20-outboard-motor-20-shaft,Shipping_NoFreight
honda-bf20-outboard-motor-15-shaft,Shipping_NoFreight
honda-bf30-outboard-motor,Shipping_NoFreight
honda-bf40-outboard-motor,Shipping_NoFreight
honda-bf50-outboard-motor,Shipping_NoFreight
honda-bf60-outboard-motor,Shipping_NoFreight
honda-bf75-outboard-motor,Shipping_NoFreight
honda-bf80-outboard-motor,Shipping_NoFreight
honda-bf90-outboard-motor,Shipping_NoFreight
honda-bf100-outboard-motor,Shipping_NoFreight
honda-bf115-outboard-motor,Shipping_NoFreight
honda-bf135-outboard-motor,Shipping_NoFreight
honda-bf150-outboard-motor,Shipping_NoFreight
honda-bf225-outboard-motor,Shipping_NoFreight
honda-bf250-outboard-motor,Shipping_NoFreight
honda-bf350-outboard-motor,Shipping_NoFreight
honda-bf200-outboard-motor,Shipping_NoFreight
cb500f-heated-grip-attachment,Shipping_4999
rear-seat-bag-attachment,Shipping_4999
knuckle-guard-extension-white,Shipping_4999
1-key-components-cylinder-body-kit,Shipping_4999
cl500-rear-side-cover-decal,Shipping_4999
cb650r-tank-side-sticker,Shipping_4999
cb500f-tank-bag-attachment-kit,Shipping_4999
nc750x-pannier-case-set,Shipping_68
nx500-knuckle-guards,Shipping_4999
africa-twin-low-deflectors-set,Shipping_4999
pioneer-700-busbar-kit,Shipping_4999
cbr500r-cb500f-12v-socket,Shipping_4999
cb750-hornet-grip-ends,Shipping_4999
45l-tank-bag,Shipping_4999
africa-twin-aluminium-panniers-stay,Shipping_68
transalp-pannier-inner-bags,Shipping_4999
cbr650r-high-wind-screen,Shipping_4999
africa-twin-grip-heaters,Shipping_68
cb650r-front-fender-panels,Shipping_68
pioneer-700-underdash-storage-tray,Shipping_68
rear-seat-bag,Shipping_4999
nt1100-pannier-support-kit,Shipping_4999
africa-twin-comfort-seat-paulista-red,Shipping_68
cl500-rear-side-cover,Shipping_4999
africa-twin-aluminium-panniers-inner-bags-set-of-2,Shipping_4999
africa-twin-nx500-top-box-lock,Shipping_4999
africa-twin-low-seat-paulista-red,Shipping_4999
pioneer-1000-3p6p-bed-mat,Shipping_68
nx500-cb750-side-bags,Shipping_68
pioneer-1000-520-horn-kit,Shipping_4999
cbr500r-tank-bag-attachment,Shipping_4999
africa-twin-plastic-top-box-base,Shipping_4999
pioneer-1000-3p-rear-fox-shocks,Shipping_68
pioneer-1000-glass-windshield,Shipping_68
pioneer-1000-fabric-front-doors-black,Shipping_68
cbr500r-smoke-high-windscreen,Shipping_4999
cl500-headlight-visor,Shipping_68
cb750-hornet-skid-pad,Shipping_68
cbr650r-cb650r-tank-bag-attachment,Shipping_4999
cbr650r-cb650r-quick-shifter-kit,Shipping_68
pioneer-700-winch-mount-kit,Shipping_68
transalp-aluminium-panel-50l-top-box,Shipping_4999
cbr650r-cb650r-rear-seat-cowl-matte-gunpowder-black-metallic,Shipping_68
transalp-fairing-deflector,Shipping_4999
pioneer-700-2p-hard-roof-short,Shipping_68
pioneer-520-bed-rails,Shipping_68
pioneer-520-rear-cab-net,Shipping_4999
pioneer-700-glass-windshield-wiper-kit-and-washer,Shipping_68
pioneer-1000-700-plow-blade,Shipping_68
pioneer-1000-front-bumperbrush-guard,Shipping_68
nx500-front-side-pipes,Shipping_68
nt1100-comfort-pillion-seat,Shipping_4999
cbr500r-cb500f-35l-top-box,Shipping_68
cbr500r-seat-cowl-grand-prix-red,Shipping_68
pioneer-1000-winch-mount-kit,Shipping_68
africa-twin-knuckle-guard-extension-power-red,Shipping_4999
pioneer-1000-3p-front-fox-shocks,Shipping_68
heated-grips,Shipping_68
pioneer-520-utility-basket,Shipping_68
nt1100-panel-top-box-matte-iridium-grey-metallic,Shipping_4999
cb650r-meter-visor,Shipping_4999
transalp-quick-shifter,Shipping_68
africa-twin-radiator-grille,Shipping_68
nx500-main-centre-stand,Shipping_68
pioneer-520-700-rearview-mirror,Shipping_4999
nx500-3l-tank-bag,Shipping_4999
pioneer-520-cab-frame-cargo-bag,Shipping_68
transalp-guard-attachment,Shipping_4999
nc750x-pannier-support-stay,Shipping_68
africa-twin-37l-aluminium-pannier-left,Shipping_68
pioneer-520-front-underhood-tray,Shipping_68
pioneer-520-fabric-doors-black,Shipping_68
cbr650r-high-wind-screen-smoke-grey,Shipping_4999
africa-twin-pannier-case-with-stripe,Shipping_68
pioneer-1000-3p-fabric-roof-rear-panel-black,Shipping_68
cbr500r-cb500f-rear-carrier,Shipping_68
transalp-radiator-grille,Shipping_4999
transalp-knuckle-guard,Shipping_4999
africa-twin-inner-bag-for-aluminium-top-box,Shipping_4999
pioneer-700-2p-hard-rear-panel,Shipping_68
pioneer-1000-3p5p-under-dash-storage-pocket,Shipping_68
cl500-heated-grips-attachment-kit,Shipping_4999
hand-grip-cement,Shipping_4999
nt1100-africa-twin-comfort-pillion-steps,Shipping_4999
nt1100-front-fog-lights-attachment,Shipping_68
cbr500r-grip-heater-attachment,Shipping_4999
kit-front-side-pipe,Shipping_68
cbr500r-cb500f-top-box-inner-bag-25l,Shipping_4999
africa-twin-33l-aluminium-pannier-right,Shipping_68
pioneer-1000-aluminum-a-arm-guards-front,Shipping_68
nx500-rear-carrier,Shipping_68
pioneer-1000-3p-bimini-top,Shipping_68
inner-bag-for-38l-top-box,Shipping_4999
pioneer-1000-5p-bed-extender,Shipping_68
pioneer-700-bed-extender,Shipping_68
cl500-rear-cushion-cover,Shipping_4999
pioneer-1000-fuse-box-wiring-kit,Shipping_4999
cb500f-main-centre-stand,Shipping_68
pioneer-520-bed-rack,Shipping_68
pioneer-1000-3p-hard-roof,Shipping_68
pioneer-1000-rearview-mirror,Shipping_4999
pioneer-1000-side-mirrors,Shipping_68
africa-twin-rally-step,Shipping_4999
africa-twin-upper-deflector,Shipping_4999
africa-twin-low-seat-grand-blue,Shipping_4999
pioneer-1000-aluminium-skid-plate-2016-2023,Shipping_68
africa-twin-aluminium-top-box-bracket,Shipping_68
cl500-left-saddlebag-large,Shipping_68
pioneer-520-hard-roof,Shipping_68
pioneer-520-fabric-doors-camo,Shipping_68
cl500-heated-grips,Shipping_4999
pioneer-700-glass-windshield,Shipping_68
pioner-1000-windshield-wiper-kit-2016-2023,Shipping_68
transalp-aluminium-panels-for-panniers-set,Shipping_4999
nt1100-top-box-panel-50l-black,Shipping_68
cbr650r-tank-side-sticker,Shipping_4999
pioneer-520-mount-plate,Shipping_4999
pioneer-520-accessory-sub-harness,Shipping_4999
pioneer-700-4p-hard-roof-extended,Shipping_68
pioneer-700-4p-hard-midrear-panel-combines-with-short-hard-roof,Shipping_68
nx500-12v-socket,Shipping_4999
transalp-50l-top-box-pad-cushion-back-rest,Shipping_4999
africa-twin-low-seat-black,Shipping_4999
pioneer-1000-3p-fabric-rear-panel,Shipping_68
transalp-front-fog-light-attachment,Shipping_4999
cl500-left-saddlebag-support-bracket,Shipping_4999
cbr650r-rear-seat-cowl-grand-prix-red,Shipping_68
kit-grip-heater-attachment,Shipping_68
nc750x-rear-carrier-resin-silver,Shipping_68
cbr650r-tank-pad-cbr-logo,Shipping_4999
pioneer-1000-3p-hard-midrear-panel,Shipping_68
pioneer-700-1000-warn-vrx-45-winch,Shipping_68
cb500f-meter-visor,Shipping_4999
pioneer-700-4p-hard-midrear-panel-combines-with-extended-hard-roof,Shipping_68
africa-twin-adventure-sports-main-centre-stand,Shipping_68
transalp-50l-top-box-base,Shipping_68
nc750x-grip-heaters,Shipping_68
africa-twin-comfort-seat-grand-blue,Shipping_68
pioneer-1000-700-led-headlights,Shipping_68
pioneer-1000-3p5p-hard-doors,Shipping_68
cbr650r-cb650r-seat-cowl-plate,Shipping_4999
pioneer-520-chainsaw-mount,Shipping_68
cb750-hornet-handle-holder,Shipping_4999
africa-twin-42l-aluminium-top-box,Shipping_68
cl500-front-fender,Shipping_4999
pioneer-1000-5p-hard-roof,Shipping_68
transalp-front-side-pipe,Shipping_68
africa-twin-front-side-pipe,Shipping_68
nc750x-usb-charger,Shipping_1495
cb750-hornet-meter-visor,Shipping_4999
africa-twin-front-led-fog-lights-attachment,Shipping_4999
nx500-leg-deflectors,Shipping_4999
38l-top-box,Shipping_68
pioneer-520-multi-tool-holder,Shipping_4999
pioneer-520-winch-mount-kit,Shipping_68
pioneer-1000-fender-flares,Shipping_68
cbr650r-cb650r-grip-heater-attachment,Shipping_4999
nc750x-light-bar,Shipping_68
transalp-grip-heaters,Shipping_68
africa-twin-engine-guard,Shipping_68
cb750-hornet-grip-heaters,Shipping_68
pioneer-700-hard-front-doors,Shipping_68
africa-twin-dct-pedal-shift,Shipping_68
transalp-skid-plate,Shipping_68
cb650r-side-covers,Shipping_68
pioneer-1000-fuse-box-with-audio-mount-bracket,Shipping_4999
africa-twin-side-tank-pad,Shipping_4999
3l-tank-bag,Shipping_4999
africa-twin-comfort-seat-black,Shipping_68
nt1100-kit-rl-pannier-panel-cover-black,Shipping_68
cl500-carrier-bracket,Shipping_4999
cb750-hornet-quick-shifter,Shipping_68
pioneer-520-700-side-mirrors,Shipping_68
cbr650r-cb650r-grip-heater,Shipping_68
cb750-hornet-seat-cowl,Shipping_68
nc750x-main-centre-stand,Shipping_68
transalp-main-centre-stand,Shipping_68
pioneer-700-fuse-box-wiring-kit,Shipping_4999
pioneer-1000-6p-steel-front-bumper,Shipping_68
nt1100-quick-shifter,Shipping_68
africa-twin-engine-guard-attachment,Shipping_4999
pioneer-1000-6p-hard-roof,Shipping_68
cbr500r-cb500f-cb750-tank-pad-carbon-fibre,Shipping_4999
transalp-engine-guard,Shipping_68
cb650r-under-cowl,Shipping_4999
50l-manual-top-box,Shipping_68
pioneer-520-nerf-bars,Shipping_68
nx500-side-bag-attachments,Shipping_68
nx500-wind-screen-smoke,Shipping_4999
cl500-top-box-lock,Shipping_4999
top-box-backrest,Shipping_4999
pioneer-520-700-light-bar-clamp-44mm,Shipping_4999
africa-twin-adventure-sports-front-side-pipe,Shipping_68
cl500-1-key-inner-cylinder,Shipping_4999
africa-twin-main-centre-stand,Shipping_68
cl500-knuckle-guard,Shipping_4999
pioneer-520-700-light-bar-clamp-38mm,Shipping_4999
africa-twin-inner-bag-for-58l-top-box,Shipping_4999
africa-twin-quick-shifter,Shipping_68
pioneer-1000-5p-fabric-rear-panel,Shipping_68
africa-twin-12v-socket,Shipping_4999
pioneer-700-fender-flares,Shipping_68
1-key-components-cylinder-inner-kit-wave-key,Shipping_4999
pioneer-1000-5p-hard-midrear-panel,Shipping_68
nx500-tank-bag-attachment-kit,Shipping_4999
front-led-fog-lights,Shipping_68
pioneer-20-inch-led-light-bar,Shipping_68
cb650r-shroud-covers,Shipping_68
transalp-pannier-case-set,Shipping_68
cl500-headlight-visor-decal,Shipping_4999
pioneer-700-fabric-midrear-panel,Shipping_68
knuckle-guard-extension-black,Shipping_4999
africa-twin-inner-bag-for-plastic-panniers,Shipping_4999
transalp-high-screen,Shipping_4999
africa-twin-side-tank-pads,Shipping_4999
pioneer-520-cargo-box,Shipping_68
cb650r-meter-visor-stay,Shipping_4999
pioneer-700-4p-hard-roof-short,Shipping_68
pioneer-1000-dash-pocket-net,Shipping_4999
pioneer-7001000-fuse-box,Shipping_68
nt1100-panel-rl-pannier-cover-in-matte-iridium-grey-metallic,Shipping_68
africa-twin-58l-top-box-with-stripe,Shipping_68
nc750x-tall-windscreen,Shipping_4999
nx500-front-led-fog-light-attachments,Shipping_68
cbr500r-35l-top-box-base,Shipping_4999
nt1100-comfort-rider-seat,Shipping_4999
honda-pioneer-100-6,Shipping_NoFreight
2025-honda-crf450x-off-road-motorcycle,Shipping_NoFreight
honda-cb500-hornet-motorcycle,Shipping_NoFreight
honda-dio-nsc110-scooter,Shipping_NoFreight
xl750-transalp,Shipping_NoFreight
honda-pcx160-scooter,Shipping_NoFreight
honda-crf450r,Shipping_NoFreight
cbr650r,Shipping_NoFreight
honda-pioneer-1000-3p,Shipping_NoFreight
honda-monkey-motorcycle,Shipping_NoFreight
cbr1000rr-r-fireblade,Shipping_NoFreight
honda-crf300l-motorcycle,Shipping_NoFreight
honda-gold-wing-tour,Shipping_NoFreight
cmx500-rebel-s,Shipping_NoFreight
honda-talon-1000r,Shipping_NoFreight
crf450rx,Shipping_NoFreight
pioneer-1000-3p-trail,Shipping_NoFreight
honda-msx125-grom,Shipping_NoFreight
crf1100-africa-twin-dct-es,Shipping_NoFreight
crf300-rally,Shipping_NoFreight
crf250r,Shipping_NoFreight
honda-ct125-hunter,Shipping_NoFreight
cbr500r,Shipping_NoFreight
honda-crf50f-off-road-motorcycle,Shipping_NoFreight
pioneer-1000-5p-deluxe,Shipping_NoFreight
honda-gold-wing-bagger,Shipping_NoFreight
honda-pioneer-520-2p,Shipping_NoFreight
honda-pioneer-700-2p-side-by-side,Shipping_NoFreight
pioneer-1000-5p-trail,Shipping_NoFreight
pioneer-1000-3p-forest,Shipping_NoFreight
honda-cl500-scrambler,Shipping_NoFreight
pioneer-1000-3p-deluxe,Shipping_NoFreight
honda-pioneer-1000-5p-forest-side-by-side,Shipping_NoFreight
crf1100-africa-twin-adventure-sports-es,Shipping_NoFreight
honda-nt1100-touring-motorcycle,Shipping_NoFreight
cmx500-rebel,Shipping_NoFreight
honda-pioneer-700-4p-side-by-side,Shipping_NoFreight
trx420fm1,Shipping_NoFreight
honda-xr190-fuel-injected-farm-favourite,Shipping_NoFreight
honda-xrm125-farm-bike,Shipping_NoFreight
trx520fm2,Shipping_NoFreight
trx520fa7,Shipping_NoFreight
honda-xr150l,Shipping_NoFreight
honda-ct125-farm,Shipping_NoFreight
honda-crf250f,Shipping_NoFreight
trx420fm2,Shipping_NoFreight
honda-crf250rx-off-road-motorcycle,Shipping_NoFreight
honda-crf125fb-big-wheel,Shipping_NoFreight
trx420fa2,Shipping_NoFreight
trx520fa6,Shipping_NoFreight
crf125f,Shipping_NoFreight
honda-navi,Shipping_NoFreight
trx420tm1,Shipping_NoFreight
cbr600rr,Shipping_NoFreight
honda-trx520fm1-atv,Shipping_NoFreight
cb125f,Shipping_NoFreight
trx700fa5,Shipping_NoFreight
honda-gb350,Shipping_NoFreight
honda-nx500-motorcycle,Shipping_NoFreight
crf110f,Shipping_NoFreight
honda-nc750x-motorcycle,Shipping_NoFreight
honda-trx250tm-atv,Shipping_NoFreight
trx520fm6,Shipping_NoFreight
hru196m2-lawnmower,Shipping_89
hrg466-lawn-mower-combo-kit-battery,Shipping_89
hru19m2-lawnmower,Shipping_89
new-boats-to-come,Shipping_1495
honda-bf15,Shipping_1495
honda-bf10,Shipping_1495
ctek-5-0-5a12-volt-battery-chargers,Shipping_1495
honda-bf8,Shipping_1495
honda-bf2-3,Shipping_1495`;

interface TagUpdate {
  handle: string;
  tag: string;
}

interface ProductByHandleResponse {
  productByIdentifier: {
    id: string;
    title: string;
    tags: string[];
  } | null;
}

interface TagsAddResponse {
  tagsAdd: {
    node: {
      id: string;
    } | null;
    userErrors: Array<{
      field: string[];
      message: string;
    }>;
  };
}

function parseCSV(csvData: string): TagUpdate[] {
  const lines = csvData.trim().split('\n');
  const updates: TagUpdate[] = [];

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const [handle, tag] = line.split(',');
    if (handle && tag) {
      updates.push({ handle: handle.trim(), tag: tag.trim() });
    }
  }

  return updates;
}

async function graphqlRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(
    `https://${config.shopify.storeDomain}/admin/api/${config.shopify.apiVersion}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': config.shopify.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  return data.data as T;
}

async function getProductByHandle(handle: string): Promise<{ id: string; title: string; tags: string[] } | null> {
  const query = `
    query getProductByHandle($handle: String!) {
      productByIdentifier(identifier: { handle: $handle }) {
        id
        title
        tags
      }
    }
  `;

  const data = await graphqlRequest<ProductByHandleResponse>(query, { handle });
  return data.productByIdentifier;
}

async function addTagToProduct(productId: string, tag: string): Promise<boolean> {
  const mutation = `
    mutation tagsAdd($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        node {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await graphqlRequest<TagsAddResponse>(mutation, {
    id: productId,
    tags: [tag],
  });

  if (data.tagsAdd.userErrors.length > 0) {
    logger.error('Failed to add tag', {
      productId,
      tag,
      errors: data.tagsAdd.userErrors,
    });
    return false;
  }

  return true;
}

async function main(): Promise<void> {
  logger.info('=== Add Shipping Tags to Products ===');
  logger.info(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  logger.info('');

  // Step 1: Parse CSV data
  const updates = parseCSV(CSV_DATA);
  logger.info(`Parsed ${updates.length} products from CSV`);
  logger.info('');

  // Group by tag for summary
  const tagCounts = new Map<string, number>();
  for (const update of updates) {
    tagCounts.set(update.tag, (tagCounts.get(update.tag) || 0) + 1);
  }

  logger.info('Tags to add:');
  for (const [tag, count] of tagCounts.entries()) {
    logger.info(`  ${tag}: ${count} products`);
  }
  logger.info('');

  if (DRY_RUN) {
    logger.info('DRY RUN - showing first 10 products:');
    for (const update of updates.slice(0, 10)) {
      logger.info(`  ${update.handle} → ${update.tag}`);
    }
    logger.info(`  ... and ${updates.length - 10} more`);
    logger.info('');
    logger.info('DRY RUN complete. No changes made.');
    logger.info(`Run without --dry-run to update ${updates.length} products.`);
    return;
  }

  // Step 2: Process each product
  let success = 0;
  let failed = 0;
  let notFound = 0;
  let alreadyHasTag = 0;

  for (let i = 0; i < updates.length; i++) {
    const { handle, tag } = updates[i];
    const progress = `[${i + 1}/${updates.length}]`;

    try {
      // Find product by handle
      const product = await getProductByHandle(handle);

      if (!product) {
        logger.warn(`${progress} Product not found: ${handle}`);
        notFound++;
        continue;
      }

      // Check if tag already exists
      if (product.tags.includes(tag)) {
        logger.info(`${progress} ${handle} - already has tag "${tag}"`);
        alreadyHasTag++;
        continue;
      }

      // Add the tag
      const added = await addTagToProduct(product.id, tag);

      if (added) {
        success++;
        logger.info(`${progress} ${handle} - added "${tag}"`);
      } else {
        failed++;
        logger.error(`${progress} ${handle} - failed to add "${tag}"`);
      }
    } catch (error) {
      failed++;
      logger.error(`${progress} ${handle} - error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Rate limiting: 200ms between updates
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Step 3: Summary
  logger.info('');
  logger.info('=== Summary ===');
  logger.info(`Total in CSV: ${updates.length}`);
  logger.info(`Successfully added: ${success}`);
  logger.info(`Already had tag: ${alreadyHasTag}`);
  logger.info(`Not found: ${notFound}`);
  logger.info(`Failed: ${failed}`);
}

// Run
main().catch(error => {
  logger.error('Script failed', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
