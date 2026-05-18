import { PropsWithChildren } from 'react';

import { ScrollViewStyleReset } from 'expo-router/html';

export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>Desafio Calculo Mental</title>
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html:
              'html,body,#root{width:100%;max-width:100%;overflow-x:hidden}*{box-sizing:border-box}',
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
