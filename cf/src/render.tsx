import { ImageResponse } from '@takumi-rs/image-response/wasm';
import module from '@takumi-rs/wasm/takumi_wasm_bg.wasm';
import Archivo from './Archivo.woff2';
import ArchivoExC from './ArchivoExtraCondensed-Medium.woff2';
import ArchivoC from './ArchivoCondensed-Medium.woff2';
import ArchivoSemC from './ArchivoSemiCondensed-Medium.woff2';
import labsLogo from './labs.svg';
import { Exercise, ExerciseGroups, kgToLbs, lbsToKg } from './gymrun';
import { Fragment } from 'react/jsx-runtime';

function calculateStretch(name: string): number {
	return Math.round(Math.min(100, Math.max(0, name.length * -2.1 + 194)));
}

function mapFontName(stretchValue: number): string {
	if (stretchValue >= 100) return 'Archivo';
	if (stretchValue >= 87.5) return 'Archivo_SemiCondensed';
	if (stretchValue >= 75) return 'Archivo_Condensed';
	return 'Archivo_ExtraCondensed';
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
								tw={`text-[1.6rem] font-semibold font-['${mapFontName(calculateStretch(entry[0].name))}']`}
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
			// fetchedResources: await fetchedResources,
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
