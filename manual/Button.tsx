import React from 'react';
import _ from 'lodash';
import * as chalk from 'chalk';

export const Button = ({
  label,
  onClick,
  type = 'button',
}: {
  label: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  type?: 'button' | 'submit';
}) => {
  return (
    <button className="updated" type={type} onClick={onClick}>
      {label}
    </button>
  );
};
