import { EnvWithAzure } from "./graph-auth";
import { getFromStorage } from "./storage";
import { render } from "./render";

export async function handleRenderRoutes(
    request: Request,
    env: EnvWithAzure,
    path: string,
    url: URL
): Promise<Response | null> {
  const method = request.method;

  // GET /card.png → image/png
  if (method === 'GET' && path === '/card.png') {
    const data = await getFromStorage(env, 'data') ?? [];
    const unit = url.searchParams.get('unit') || 'native';

    const renderedImage = await render(data, unit);
    // return renderedImage;
    const image = await renderedImage.arrayBuffer();

    return new Response(image, {
      headers: { 'Content-Type': 'image/png' },
    });
  }

  // GET /card.svg → Redirect to /card.png
  if (method === 'GET' && path === '/card.svg') {
    return Response.redirect(url.toString().replace('/card.svg', '/card.png'), 302);
  }

  return null;
}