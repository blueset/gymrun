import { ImageResponse } from '@takumi-rs/image-response/wasm';
import module from '@takumi-rs/wasm/takumi_wasm_bg.wasm';
import Archivo from './Archivo.woff2';
import ArchivoExC from './ArchivoExtraCondensed-Medium.woff2';
import ArchivoC from './ArchivoCondensed-Medium.woff2';
import ArchivoSemC from './ArchivoSemiCondensed-Medium.woff2';
import labsLogo from './labs.svg';
import { Exercise, ExerciseGroups, kgToLbs, lbsToKg } from './gymrun';
import { Fragment } from 'react/jsx-runtime';

const regularFallbackAdvanceWidth = 672;
const regularAsciiAdvanceWidth = [209,273,374,582,510,950,692,209,355,355,407,625,277,333,277,294,573,521,567,573,555,571,573,553,574,573,296,296,625,625,625,578,1005,682,698,728,734,677,612,796,736,267,559,662,536,847,736,788,665,788,727,673,606,731,648,924,680,655,635,296,294,296,625,485,187,545,567,519,567,548,280,556,563,225,223,514,225,860,563,570,567,567,332,510,297,562,504,723,513,504,498,353,245,353,62];
const condensedFallbackAdvanceWidth = 616;
const condensedAsciiAdvanceWidth = [130, 242, 296, 440, 326, 619, 464, 170, 313, 313, 369, 467, 190, 240, 190, 256, 389, 340, 397, 390, 370, 403, 387, 343, 378, 387, 220, 220, 467, 467, 467, 377, 660, 434, 453, 485, 490, 432, 381, 508, 486, 201, 365, 465, 366, 609, 488, 519, 442, 519, 475, 421, 420, 479, 435, 646, 458, 477, 438, 275, 256, 275, 467, 316, 129, 388, 385, 365, 385, 385, 213, 360, 378, 176, 173, 353, 176, 580, 379, 387, 385, 385, 226, 326, 202, 379, 307, 497, 343, 307, 335, 316, 183, 316, 467];

const columnWidth = 20000;

function calculateStretch(name: string): number {
	const regularWidth = name.split('').reduce((sum, char) => {
		const charCode = char.charCodeAt(0);
		if (charCode >= 32 && charCode <= 126) {
			return sum + regularAsciiAdvanceWidth[charCode - 32];
		} else {
			// console.log('Non-ASCII character in name:', char);
			return sum + regularFallbackAdvanceWidth;
		}
	}, 0);
	const condensedWidth = name.split('').reduce((sum, char) => {
		const charCode = char.charCodeAt(0);
		if (charCode >= 32 && charCode <= 126) {
			return sum + condensedAsciiAdvanceWidth[charCode - 32];
		} else {
			// console.log('Non-ASCII character in name:', char);
			return sum + condensedFallbackAdvanceWidth;
		}
	}, 0);

	// Map stretch linearly between condensed (62) and regular (100) to hit the target column width.
	const widthRange = regularWidth - condensedWidth;
	if (widthRange === 0) return 100;

	
	const stretch = 62 + ((columnWidth - condensedWidth) * (100 - 62)) / widthRange;
	// console.log({ name, regularWidth, condensedWidth, stretch });
	return Math.max(62, Math.min(100, Math.round(stretch)));
}

function WeightBox({
	weight,
	unit,
	reps,
	sameWeight,
	index,
}: {
	weight: number;
	unit: string;
	reps: number;
	sameWeight: boolean;
	index: number;
}) {
	return (
		<Fragment>
			{(!sameWeight && weight && unit) ? (
				<span
					tw={`bg-[#F2A711] text-[#00161F] leading-none h-6 min-w-6 text-center pt-0.5 px-2 mr-2 ${index > 0 ? 'ml-2' : ''}`}
					style={{ borderRadius: '6px' }}
				>
					{weight} {unit}
				</span>
			) : null}
			<span
				tw={`border border-[#F2A711] leading-none h-6 min-w-6 text-center text-[#F2A711] ${sameWeight ? 'border-l-0' : ''} px-1`}
				style={{ borderRadius: '6px', ...(sameWeight ? { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 } : {}) }}
			>
				{reps}
			</span>
		</Fragment>
	);
}

function FormattedSet({ set, unit }: { set: Exercise[]; unit: string }) {
	return set.map((exercise, index) => {
		let sameWeight = index > 0 && exercise.weight === set[index - 1].weight && exercise.unit === set[index - 1].unit;
		if (!exercise.unit) return <WeightBox key={index} weight={0} unit="" reps={exercise.reps} sameWeight={sameWeight} index={index} />;
		if (unit === 'lbs') {
			const weightInLbs = exercise.unit === 'kg' ? Math.round(kgToLbs(exercise.weight)) : exercise.weight;
			return <WeightBox key={index} weight={weightInLbs} unit="lbs" reps={exercise.reps} sameWeight={sameWeight} index={index} />;
		} else if (unit === 'kg') {
			const weightInKg = exercise.unit === 'lbs' ? Math.round(lbsToKg(exercise.weight)) : exercise.weight;
			return <WeightBox key={index} weight={weightInKg} unit="kg" reps={exercise.reps} sameWeight={sameWeight} index={index} />;
		} else {
			return (
				<WeightBox key={index} weight={exercise.weight} unit={exercise.unit} reps={exercise.reps} sameWeight={sameWeight} index={index} />
			);
		}
	});
}

function formatTimeAgo(date: Date): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

	const diffSeconds = Math.round(diffMs / 1000);
	const diffMinutes = Math.round(diffMs / (1000 * 60));
	const diffHours = Math.round(diffMs / (1000 * 60 * 60));
	const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
	const diffWeeks = Math.round(diffMs / (1000 * 60 * 60 * 24 * 7));
	const diffMonths = Math.round(diffMs / (1000 * 60 * 60 * 24 * 30));
	const diffYears = Math.round(diffMs / (1000 * 60 * 60 * 24 * 365));

	if (diffSeconds < 10) {
		return 'just now';
	} else if (diffSeconds < 60) {
		return formatter.format(-diffSeconds, 'second');
	} else if (diffMinutes < 60) {
		return formatter.format(-diffMinutes, 'minute');
	} else if (diffHours < 24) {
		return formatter.format(-diffHours, 'hour');
	} else if (diffDays < 7) {
		return formatter.format(-diffDays, 'day');
	} else if (diffWeeks < 4) {
		return formatter.format(-diffWeeks, 'week');
	} else if (diffMonths < 12) {
		return formatter.format(-diffMonths, 'month');
	} else {
		return formatter.format(-diffYears, 'year');
	}
}

export async function render(entries: ExerciseGroups, unit: string) {
	const logoBase64 = 'data:image/svg+xml,' + encodeURIComponent(String.fromCharCode(...new Uint8Array(labsLogo)));
	const lastUpdated = entries
		.flatMap((group) => group)
		.reduce((latest, exercise) => {
			const exerciseDate = new Date(exercise.time);
			return exerciseDate > latest ? exerciseDate : latest;
		}, new Date(0));
	const timeAgo = formatTimeAgo(lastUpdated);

	return new ImageResponse(
		(
			<div tw="bg-[#00161F] w-full h-full text-white p-14 flex flex-col gap-4">
				<header tw="flex flex-row justify-between w-full">
					<img src={logoBase64} alt="Logo" tw="h-14" />
					<div tw="flex flex-row gap-6">
						<div tw="flex flex-col items-end text-lg justify-center text-right">
							<span tw="">Last updated {timeAgo}</span>
							<span tw="text-white/50">github.com/blueset/gymrun</span>
						</div>
						<div
							tw="text-3xl font-semibold bg-[#F2A711] text-[#00161F] px-4 py-0 align-center justify-center flex flex-col"
							style={{
								borderRadius: '8px',
							}}
						>
							<span>Recent workout</span>
						</div>
					</div>
				</header>
				<main tw="grid grid-cols-2 flex-grow content-center gap-4">
					{entries.map((entry, index) => (
						<div key={index} tw="flex flex-col gap-1">
							<span
								tw={`text-[1.6rem] font-semibold`}
								style={{ fontVariationSettings: `"wdth" ${calculateStretch(entry[0].name)}` }}
							>
								{entry[0].name}
							</span>
							<span tw="text-xl text-white/75 flex">
								<FormattedSet set={entry} unit={unit} />
							</span>
						</div>
					))}
				</main>
				<footer tw="text-white/50">
					Data collected via GymRun app and OneDrive backup. 1A23 Studio is not affiliated with GymRun Team or Microsoft Corporation.
				</footer>
			</div>
		),
		{
			width: 1200,
			height: 675,
			fonts: [
				{ font: 'Archivo', data: Archivo },
				{ font: 'Archivo ExtraCondensed', data: ArchivoExC },
				{ font: 'Archivo Condensed', data: ArchivoC },
				{ font: 'Archivo SemiCondensed', data: ArchivoSemC },
			],
			module,
		}
	);
}
