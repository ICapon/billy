import Page from '../src/app/page';

const redirect = jest.fn();
jest.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
}));

describe('Page', () => {
  it('redirects to the dashboard', () => {
    Page();
    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });
});
