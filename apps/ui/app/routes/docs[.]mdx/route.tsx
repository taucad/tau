import { redirect } from 'react-router';

// To follow the `.mdx` path appending pattern, we need to create a route that
// redirects to the llms.mdx route for the index docs route.
export async function loader(): Promise<Response> {
  return redirect('/llms.mdx/');
}
