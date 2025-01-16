const greyCodeStyles = {
  fontSize: '18.75rem',
  fontWeight: '600',
  backgroundColor: 'rgba(200,200,200,1)',
  borderRadius: '5rem',
  padding: '0 5rem',
};

export const Logo = () => {
  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif, 'Fira Code', monospace",
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '1000%',
      }}
    >
      <h1
        style={{
          letterSpacing: '0',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <div style={{ marginBottom: '1.5rem' }}>
          <code
            style={{
              fontSize: '18.75rem',
              fontWeight: '600',
              color: 'white',
              backgroundColor: 'rgba(50,50,50,1)',
              borderRadius: '5rem',
              borderBottomRightRadius: '0',
              padding: '0 5rem',
              marginRight: '0.675rem',
              boxShadow: 'inset 30px 30px 50px rgba(100, 100, 100, 0.8)',
            }}
          >
            <span style={{ position: 'relative', top: '-1rem' }}>o</span>
          </code>
          <code
            style={{
              ...greyCodeStyles,
              borderBottomLeftRadius: '0',
              padding: '0 6rem 0 4rem',
              marginLeft: '0.675rem',
              boxShadow: 'inset -30px 30px 50px rgba(100, 100, 100, 0.5)',
            }}
          >
            <span style={{ position: 'relative', top: '-1rem' }}>c</span>
          </code>
        </div>
        <div>
          <code
            style={{
              ...greyCodeStyles,
              borderTopRightRadius: '0',
              marginRight: '0.675rem',
              boxShadow: 'inset 30px -30px 50px rgba(100, 100, 100, 0.5)',
            }}
          >
            <span style={{ position: 'relative', top: '-1rem' }}>s</span>
          </code>
          <code
            style={{
              ...greyCodeStyles,
              borderTopLeftRadius: '0',
              padding: '0 6.5rem 0 3.5rem',
              marginBottom: '-10px',
              marginLeft: '0.675rem',
              boxShadow: 'inset -30px -30px 50px rgba(100, 100, 100, 0.5)',
            }}
          >
            <span style={{ position: 'relative', top: '-1rem' }}>r</span>
          </code>
        </div>
      </h1>
    </div>
  );
};
