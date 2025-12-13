import { EnvWithAzure } from "./graph-auth";
import { ExerciseGroups } from "./gymrun";
import { render } from "./render";

function caption(exercise: ExerciseGroups): string {
    const groups: string[] = [];
    for (const ex of exercise) {
        const sets = ex.map(s => `${s.weight}${s.unit}×${s.reps}`).join(", ");
        groups.push(`${ex[0].name}\n${sets}`);
    }
    return "Recent workout\n\n" + groups.join("\n\n");
}

export async function tootCard(exercise: ExerciseGroups, time: number, env: EnvWithAzure): Promise<string> {
    const text = caption(exercise);
    const imageResponse = await render(exercise, 'native');
    const imageBlob = await imageResponse.blob();

    // Upload file to Misskey drive
    const formData = new FormData();
    formData.append('i', env.MISSKEY_ACCESS_TOKEN);
    formData.append('file', imageBlob, `gymrun-${new Date(time).toISOString()}.png`);

    const uploadResponse = await fetch(`${env.MISSKEY_BASE_URL}/api/drive/files/create`, {
        method: 'POST',
        body: formData,
    });
    const file = await uploadResponse.json() as { id: string };

    // Update file with description
    await fetch(`${env.MISSKEY_BASE_URL}/api/drive/files/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            i: env.MISSKEY_ACCESS_TOKEN,
            fileId: file.id,
            comment: text,
        }),
    });

    // Create note with the file
    const noteResponse = await fetch(`${env.MISSKEY_BASE_URL}/api/notes/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            i: env.MISSKEY_ACCESS_TOKEN,
            text: 'Workout of the day.',
            visibility: 'public',
            fileIds: [file.id],
        }),
    });
    const post = await noteResponse.json() as { createdNote: { id: string } };

    return `${env.MISSKEY_BASE_URL}/notes/${post.createdNote.id}`;
}